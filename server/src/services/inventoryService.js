import mongoose from 'mongoose';
import Product from '../models/Product.js';
import ApiError from '../utils/ApiError.js';
import logger from '../config/logger.js';
import { sessionOption } from '../utils/transaction.js';

/**
 * Inventory lifecycle.
 *
 *   place order      -> reserve()   stock unchanged, reservedStock +qty, available -qty
 *   payment confirmed-> commit()    stock -qty,      reservedStock -qty, available unchanged
 *   cancel unpaid    -> release()   stock unchanged, reservedStock -qty, available +qty
 *   refund/cancel paid-> restock()  stock +qty,                          available +qty
 *
 * Every step is a *conditional* single-document update. `reserve` only succeeds
 * when `availableStock >= qty`, so two concurrent checkouts for the last jar can
 * never both win - the second one's update matches nothing and is rolled back.
 * That guarantee holds even on a standalone mongod without transactions.
 *
 * The `Order.stockState` field records which step an order is currently in, which
 * is what makes a replayed payment callback or a double cancellation a no-op.
 */

const toObjectId = (value) =>
  value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(String(value));

/**
 * Attempts to reserve every line. Rolls back the lines already reserved if any
 * single line fails, so a partial reservation is never left behind.
 *
 * @param {Array<{productId:string, variantId:string, quantity:number, name?:string, size?:string}>} lines
 */
export async function reserveStock(lines, session) {
  const reserved = [];
  try {
    for (const line of lines) {
      const result = await Product.updateOne(
        {
          _id: toObjectId(line.productId),
          variants: {
            $elemMatch: {
              _id: toObjectId(line.variantId),
              isActive: true,
              availableStock: { $gte: line.quantity },
            },
          },
        },
        {
          $inc: {
            'variants.$[variant].reservedStock': line.quantity,
            'variants.$[variant].availableStock': -line.quantity,
            totalStock: -line.quantity,
          },
        },
        {
          arrayFilters: [{ 'variant._id': toObjectId(line.variantId) }],
          ...sessionOption(session),
        }
      );

      if (result.modifiedCount !== 1) {
        throw ApiError.conflict(
          `${line.name ?? 'This product'}${line.size ? ` (${line.size})` : ''} just went out of stock. Please review your cart.`
        );
      }
      reserved.push(line);
    }
    return reserved;
  } catch (error) {
    // Without a transaction we must undo by hand; inside one the abort handles it,
    // but releasing twice is harmless because release is also conditional.
    if (!session && reserved.length) {
      await releaseStock(reserved).catch((releaseError) =>
        logger.error('Failed to roll back a partial stock reservation:', releaseError)
      );
    }
    throw error;
  }
}

/** Converts a reservation into a real stock deduction. */
export async function commitStock(lines, session) {
  for (const line of lines) {
    const result = await Product.updateOne(
      {
        _id: toObjectId(line.productId),
        variants: {
          $elemMatch: {
            _id: toObjectId(line.variantId),
            reservedStock: { $gte: line.quantity },
            stock: { $gte: line.quantity },
          },
        },
      },
      {
        $inc: {
          'variants.$[variant].stock': -line.quantity,
          'variants.$[variant].reservedStock': -line.quantity,
          soldCount: line.quantity,
        },
      },
      { arrayFilters: [{ 'variant._id': toObjectId(line.variantId) }], ...sessionOption(session) }
    );

    if (result.modifiedCount !== 1) {
      // Not fatal: the order is already paid. Log loudly so it can be reconciled
      // rather than failing the customer's payment confirmation.
      logger.error(
        `Stock commit mismatch for product=${line.productId} variant=${line.variantId} qty=${line.quantity}`
      );
    }
  }
}

/** Frees a reservation (order cancelled or expired before payment). */
export async function releaseStock(lines, session) {
  for (const line of lines) {
    await Product.updateOne(
      {
        _id: toObjectId(line.productId),
        variants: { $elemMatch: { _id: toObjectId(line.variantId), reservedStock: { $gte: line.quantity } } },
      },
      {
        $inc: {
          'variants.$[variant].reservedStock': -line.quantity,
          'variants.$[variant].availableStock': line.quantity,
          totalStock: line.quantity,
        },
      },
      { arrayFilters: [{ 'variant._id': toObjectId(line.variantId) }], ...sessionOption(session) }
    );
  }
}

/** Returns already-deducted stock to the shelf (refund, or cancellation after payment). */
export async function restockItems(lines, session) {
  for (const line of lines) {
    await Product.updateOne(
      { _id: toObjectId(line.productId), 'variants._id': toObjectId(line.variantId) },
      {
        $inc: {
          'variants.$[variant].stock': line.quantity,
          'variants.$[variant].availableStock': line.quantity,
          totalStock: line.quantity,
          soldCount: -line.quantity,
        },
      },
      { arrayFilters: [{ 'variant._id': toObjectId(line.variantId) }], ...sessionOption(session) }
    );
  }
}

/** Maps order items onto the shape the functions above expect. */
export function linesFromOrder(order) {
  return (order.items ?? []).map((item) => ({
    productId: item.product,
    variantId: item.variantId,
    quantity: item.quantity,
    name: item.name,
    size: item.size,
  }));
}

/**
 * Admin stock adjustment. Sets on-hand stock directly and recomputes available,
 * never touching reservations that belong to live orders.
 */
export async function setVariantStock({ productId, variantId, stock }) {
  const product = await Product.findById(productId);
  if (!product) throw ApiError.notFound('Product not found');
  const variant = product.variants.id(variantId);
  if (!variant) throw ApiError.notFound('Product size not found');

  if (stock < variant.reservedStock) {
    throw ApiError.badRequest(
      `Cannot set stock below the ${variant.reservedStock} unit(s) already reserved for open orders`
    );
  }
  variant.stock = stock;
  await product.save(); // pre-save hook restores availableStock and totalStock
  return product;
}

/** Products where any active size has fallen to or below its low-stock threshold. */
export async function findLowStock({ limit = 20 } = {}) {
  return Product.aggregate([
    { $match: { isActive: true } },
    { $unwind: '$variants' },
    { $match: { 'variants.isActive': true } },
    {
      $match: {
        $expr: { $lte: ['$variants.availableStock', { $ifNull: ['$variants.lowStockThreshold', 5] }] },
      },
    },
    {
      $project: {
        name: 1,
        slug: 1,
        sku: '$variants.sku',
        size: '$variants.size',
        stock: '$variants.stock',
        reservedStock: '$variants.reservedStock',
        availableStock: '$variants.availableStock',
        lowStockThreshold: '$variants.lowStockThreshold',
        thumbnail: 1,
      },
    },
    { $sort: { availableStock: 1 } },
    { $limit: limit },
  ]);
}

export default {
  reserveStock,
  commitStock,
  releaseStock,
  restockItems,
  linesFromOrder,
  setVariantStock,
  findLowStock,
};
