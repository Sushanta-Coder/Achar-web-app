import Product from '../models/Product.js';
import { getSettings } from './settingsService.js';
import { quoteDelivery } from './deliveryService.js';
import { validateCoupon } from './couponService.js';
import ApiError from '../utils/ApiError.js';
import { toRupees } from '../utils/money.js';
import { MAX_QTY_PER_ITEM } from '../utils/constants.js';

/**
 * The single source of truth for money.
 *
 * Cart summaries, the checkout preview and order creation all call `priceCart`,
 * so the customer can never be charged a figure the client invented: prices,
 * discounts, delivery and tax are always re-derived from the live product,
 * coupon, zone and settings documents.
 */

/**
 * @param {object} args
 * @param {Array<{productId:string, variantId:string, quantity:number}>} args.items
 * @param {string}  [args.couponCode]
 * @param {object}  [args.address]        { province, district } - needed for delivery
 * @param {string}  [args.paymentMethod]
 * @param {object}  [args.user]
 * @param {string}  [args.email]
 * @param {boolean} [args.enforceStock]   throw instead of reporting when out of stock
 */
export async function priceCart({
  items = [],
  couponCode = null,
  address = null,
  paymentMethod = null,
  user = null,
  email = null,
  enforceStock = false,
} = {}) {
  const settings = await getSettings();

  const productIds = [...new Set(items.map((item) => String(item.productId)))];
  const products = productIds.length
    ? await Product.find({ _id: { $in: productIds } }).populate('category', 'name nameNp slug')
    : [];
  const productMap = new Map(products.map((product) => [String(product._id), product]));

  const lines = [];
  /** Items that had to be dropped (deleted product, retired size). */
  const removed = [];
  /** Items still purchasable but adjusted (quantity clamped to available stock). */
  const issues = [];

  for (const item of items) {
    const product = productMap.get(String(item.productId));
    if (!product || !product.isActive) {
      removed.push({ ...item, reason: 'This product is no longer available' });
      continue;
    }

    const variant = product.variants.id(item.variantId);
    if (!variant || !variant.isActive) {
      removed.push({ ...item, reason: 'The selected size is no longer available' });
      continue;
    }

    const requested = Math.min(Math.max(1, Number(item.quantity) || 1), MAX_QTY_PER_ITEM);
    const available = Math.max(0, variant.availableStock ?? 0);

    if (available <= 0) {
      if (enforceStock) {
        throw ApiError.conflict(`${product.name} (${variant.size}) is out of stock`);
      }
      removed.push({ ...item, reason: `${product.name} (${variant.size}) is out of stock` });
      continue;
    }

    let quantity = requested;
    if (requested > available) {
      if (enforceStock) {
        throw ApiError.conflict(
          `Only ${available} x ${product.name} (${variant.size}) left in stock`
        );
      }
      quantity = available;
      issues.push({
        productId: String(product._id),
        variantId: String(variant._id),
        requested,
        available,
        reason: `Only ${available} left in stock - quantity adjusted`,
      });
    }

    const listPrice = toRupees(variant.price);
    const unitPrice = toRupees(
      variant.discountPrice && variant.discountPrice < variant.price
        ? variant.discountPrice
        : variant.price
    );

    lines.push({
      productId: String(product._id),
      variantId: String(variant._id),
      categoryId: product.category?._id ? String(product.category._id) : null,
      categoryName: product.category?.name ?? null,
      name: product.name,
      nameNp: product.nameNp,
      slug: product.slug,
      sku: variant.sku,
      image: product.thumbnail?.url
        ? { url: product.thumbnail.url, alt: product.thumbnail.alt }
        : { url: product.images?.[0]?.url, alt: product.images?.[0]?.alt },
      size: variant.size,
      weightGrams: variant.weightGrams,
      listPrice,
      unitPrice,
      quantity,
      lineTotal: unitPrice * quantity,
      availableStock: available,
      isLowStock: available <= (variant.lowStockThreshold ?? 5),
    });
  }

  const listSubtotal = lines.reduce((sum, line) => sum + line.listPrice * line.quantity, 0);
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const itemDiscount = Math.max(0, listSubtotal - subtotal);

  // --- Coupon ---------------------------------------------------------------
  let coupon = null;
  let couponDiscount = 0;
  let couponError = null;

  if (couponCode && lines.length) {
    try {
      const result = await validateCoupon({ code: couponCode, lines, user, email });
      coupon = result.coupon;
      couponDiscount = result.discount;
    } catch (error) {
      // A coupon that has since expired must not block the cart from rendering.
      couponError = error.message;
      if (enforceStock) throw error;
    }
  }

  const goodsTotal = Math.max(0, subtotal - couponDiscount);

  // --- Delivery -------------------------------------------------------------
  // Quoted against the goods total the customer actually pays, so stacking a
  // coupon cannot unlock free delivery the order does not qualify for.
  const delivery = address
    ? await quoteDelivery({
        district: address.district,
        province: address.province,
        subtotal: goodsTotal,
        paymentMethod,
      })
    : null;
  const deliveryCharge = delivery ? toRupees(delivery.charge) : 0;

  // --- Tax ------------------------------------------------------------------
  // Nepali retail food prices are quoted VAT-inclusive by default, so nothing is
  // added on top unless the admin explicitly switches to exclusive pricing.
  const taxRate = settings.commerce.taxRate ?? 0;
  const taxAmount =
    taxRate > 0 && !settings.commerce.pricesIncludeTax
      ? toRupees(((goodsTotal + deliveryCharge) * taxRate) / 100)
      : 0;

  const total = Math.max(0, goodsTotal + deliveryCharge + taxAmount);

  return {
    lines,
    removed,
    issues,
    coupon: coupon
      ? {
          id: String(coupon._id),
          code: coupon.code,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          description: coupon.description,
        }
      : null,
    couponError,
    delivery: delivery
      ? {
          zoneId: delivery.zone?._id ? String(delivery.zone._id) : null,
          zoneName: delivery.zoneName,
          charge: deliveryCharge,
          isFree: delivery.isFree,
          freeDeliveryThreshold: delivery.freeDeliveryThreshold,
          estimatedDays: delivery.estimatedDays,
          codAvailable: delivery.codAvailable,
        }
      : null,
    pricing: {
      listSubtotal,
      subtotal,
      itemDiscount,
      couponDiscount,
      deliveryCharge,
      taxRate: settings.commerce.pricesIncludeTax ? 0 : taxRate,
      taxAmount,
      total,
    },
    meta: {
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      lineCount: lines.length,
      currency: settings.commerce.currency,
      freeDeliveryThreshold: settings.commerce.freeDeliveryThreshold,
      amountToFreeDelivery: Math.max(
        0,
        (settings.commerce.freeDeliveryThreshold ?? 0) - goodsTotal
      ),
      minOrderAmount: settings.commerce.minOrderAmount ?? 0,
      pricesIncludeTax: settings.commerce.pricesIncludeTax,
    },
  };
}

/** Guard used at checkout, after pricing but before an order is written. */
export function assertOrderIsPlaceable(quote) {
  if (!quote.lines.length) throw ApiError.badRequest('Your cart is empty');
  if (quote.pricing.total <= 0) throw ApiError.badRequest('Order total must be greater than zero');
  const min = quote.meta.minOrderAmount ?? 0;
  if (min > 0 && quote.pricing.subtotal < min) {
    throw ApiError.badRequest(`Minimum order amount is Rs. ${min}`);
  }
}

export default { priceCart, assertOrderIsPlaceable };
