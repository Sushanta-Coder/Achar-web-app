import Wishlist from '../models/Wishlist.js';
import Product, { PRODUCT_CARD_FIELDS } from '../models/Product.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';

/**
 * Wishlist.
 *
 * Signed-in only, and scoped entirely to `req.user._id` - no endpoint accepts a
 * wishlist id, so there is nothing to tamper with. Guests keep a list in
 * `localStorage` on the client and POST it to `/merge` after logging in, which
 * is why `merge` exists.
 *
 * The stored document holds product ids only. Names, prices and stock are read
 * from the catalogue on every request, so a wishlist never shows a stale price -
 * a saved snapshot would go wrong the first time a price changed.
 */

const MAX_ITEMS = 100;

async function getOrCreate(userId) {
  return (
    (await Wishlist.findOne({ user: userId })) ??
    (await Wishlist.create({ user: userId, items: [] }))
  );
}

/**
 * Hydrates stored ids into product cards, dropping anything deactivated since it
 * was saved and reporting how many disappeared so the UI can say so.
 */
async function hydrate(wishlist) {
  const ids = wishlist.items.map((item) => item.product);
  if (!ids.length) return { products: [], unavailable: 0 };

  const products = await Product.find({ _id: { $in: ids }, isActive: true })
    .select(PRODUCT_CARD_FIELDS)
    .populate('category', 'name slug')
    .lean();

  const byId = new Map(products.map((product) => [String(product._id), product]));
  const addedAt = new Map(wishlist.items.map((item) => [String(item.product), item.addedAt]));

  // Newest first, matching the order things were saved rather than catalogue order.
  const ordered = [...wishlist.items]
    .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))
    .map((item) => byId.get(String(item.product)))
    .filter(Boolean)
    .map((product) => ({
      ...product,
      addedAt: addedAt.get(String(product._id)),
      inStock: (product.totalStock ?? 0) > 0,
    }));

  return { products: ordered, unavailable: ids.length - ordered.length };
}

export const get = asyncHandler(async (req, res) => {
  const wishlist = await getOrCreate(req.user._id);
  const { products, unavailable } = await hydrate(wishlist);

  return sendSuccess(res, {
    data: { items: products, count: products.length, unavailable },
  });
});

/** Just the ids - lets the client fill in heart icons without a full payload. */
export const ids = asyncHandler(async (req, res) => {
  const wishlist = await Wishlist.findOne({ user: req.user._id }).select('items.product').lean();
  return sendSuccess(res, {
    data: { ids: (wishlist?.items ?? []).map((item) => String(item.product)) },
  });
});

export const add = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.productId, isActive: true })
    .select('_id name')
    .lean();
  if (!product) throw ApiError.notFound('Product not found');

  const wishlist = await getOrCreate(req.user._id);

  const already = wishlist.items.some((item) => String(item.product) === String(product._id));
  if (already) {
    return sendSuccess(res, {
      message: `${product.name} is already in your wishlist`,
      data: { added: false, count: wishlist.items.length },
    });
  }

  if (wishlist.items.length >= MAX_ITEMS) {
    throw ApiError.badRequest(
      `A wishlist holds up to ${MAX_ITEMS} items. Remove one to save something new.`
    );
  }

  wishlist.items.push({ product: product._id, addedAt: new Date() });
  await wishlist.save();

  return sendSuccess(res, {
    message: `${product.name} saved to your wishlist`,
    data: { added: true, count: wishlist.items.length },
  });
});

export const remove = asyncHandler(async (req, res) => {
  const result = await Wishlist.updateOne(
    { user: req.user._id },
    { $pull: { items: { product: req.params.productId } } }
  );

  if (!result.modifiedCount) throw ApiError.notFound('That product is not in your wishlist');

  const wishlist = await Wishlist.findOne({ user: req.user._id }).select('items').lean();
  return sendSuccess(res, {
    message: 'Removed from your wishlist',
    data: { count: wishlist?.items?.length ?? 0 },
  });
});

/** One-tap heart. Returns the resulting state so the icon cannot desynchronise. */
export const toggle = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.productId, isActive: true })
    .select('_id name')
    .lean();
  if (!product) throw ApiError.notFound('Product not found');

  const wishlist = await getOrCreate(req.user._id);
  const index = wishlist.items.findIndex((item) => String(item.product) === String(product._id));

  if (index >= 0) {
    wishlist.items.splice(index, 1);
    await wishlist.save();
    return sendSuccess(res, {
      message: `${product.name} removed from your wishlist`,
      data: { inWishlist: false, count: wishlist.items.length },
    });
  }

  if (wishlist.items.length >= MAX_ITEMS) {
    throw ApiError.badRequest(
      `A wishlist holds up to ${MAX_ITEMS} items. Remove one to save something new.`
    );
  }

  wishlist.items.push({ product: product._id, addedAt: new Date() });
  await wishlist.save();

  return sendSuccess(res, {
    message: `${product.name} saved to your wishlist`,
    data: { inWishlist: true, count: wishlist.items.length },
  });
});

export const clear = asyncHandler(async (req, res) => {
  await Wishlist.updateOne({ user: req.user._id }, { $set: { items: [] } });
  return sendSuccess(res, { message: 'Wishlist cleared', data: { count: 0 } });
});

/**
 * Merges a guest's locally-stored wishlist after login. Additive, never
 * destructive: logging in on a new device must not wipe what is already saved.
 */
export const merge = asyncHandler(async (req, res) => {
  const incoming = [...new Set((req.body.productIds ?? []).map(String))];
  const wishlist = await getOrCreate(req.user._id);

  if (incoming.length) {
    const existing = new Set(wishlist.items.map((item) => String(item.product)));
    const valid = await Product.find({ _id: { $in: incoming }, isActive: true })
      .select('_id')
      .lean();

    for (const product of valid) {
      if (existing.has(String(product._id))) continue;
      if (wishlist.items.length >= MAX_ITEMS) break;
      wishlist.items.push({ product: product._id, addedAt: new Date() });
      existing.add(String(product._id));
    }
    await wishlist.save();
  }

  const { products, unavailable } = await hydrate(wishlist);
  return sendSuccess(res, {
    message: 'Your saved items have been merged',
    data: { items: products, count: products.length, unavailable },
  });
});

export default { get, ids, add, remove, toggle, clear, merge };
