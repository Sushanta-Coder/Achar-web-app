import Coupon from '../models/Coupon.js';
import CouponRedemption from '../models/CouponRedemption.js';
import Order from '../models/Order.js';
import ApiError from '../utils/ApiError.js';
import { DISCOUNT_TYPES } from '../utils/constants.js';
import { sessionOption } from '../utils/transaction.js';

/**
 * Coupon rules are enforced here and nowhere else. The client may *display* a
 * discount, but the amount that reaches an order always comes back through
 * `validateCoupon`, which re-checks every constraint against the live document.
 */

/**
 * @param {object}  args
 * @param {string}  args.code
 * @param {Array}   args.lines     priced cart lines from pricingService
 * @param {object}  [args.user]
 * @param {string}  [args.email]   used to rate-limit guests
 * @returns {Promise<{coupon: object, discount: number, eligibleAmount: number}>}
 */
export async function validateCoupon({ code, lines, user, email }) {
  const normalised = String(code ?? '').trim().toUpperCase();
  if (!normalised) throw ApiError.badRequest('Enter a coupon code');

  const coupon = await Coupon.findOne({ code: normalised });
  if (!coupon || !coupon.isActive) throw ApiError.badRequest('This coupon code is not valid');

  const now = Date.now();
  if (coupon.startsAt && coupon.startsAt.getTime() > now) {
    throw ApiError.badRequest('This coupon is not active yet');
  }
  if (coupon.expiresAt && coupon.expiresAt.getTime() < now) {
    throw ApiError.badRequest('This coupon has expired');
  }
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
    throw ApiError.badRequest('This coupon has reached its usage limit');
  }

  // Only lines matching the coupon's product/category restriction earn a discount.
  const eligibleLines = filterEligibleLines(lines, coupon);
  if (!eligibleLines.length) {
    throw ApiError.badRequest('This coupon does not apply to the items in your cart');
  }
  const eligibleAmount = eligibleLines.reduce((sum, line) => sum + line.lineTotal, 0);
  const cartTotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);

  if (coupon.minOrderAmount > 0 && cartTotal < coupon.minOrderAmount) {
    throw ApiError.badRequest(
      `Add items worth Rs. ${coupon.minOrderAmount - cartTotal} more to use this coupon`
    );
  }

  if (coupon.firstOrderOnly) {
    const previousOrders = await countCustomerOrders({ user, email });
    if (previousOrders > 0) throw ApiError.badRequest('This coupon is for first orders only');
  }

  const used = await countRedemptions({ coupon: coupon._id, user, email });
  if (used >= coupon.perUserLimit) {
    throw ApiError.badRequest('You have already used this coupon');
  }

  const discount = Math.min(coupon.computeDiscount(eligibleAmount), eligibleAmount);
  if (discount <= 0) throw ApiError.badRequest('This coupon does not reduce your total');

  return { coupon, discount, eligibleAmount };
}

function filterEligibleLines(lines, coupon) {
  const productIds = (coupon.appliesTo?.products ?? []).map(String);
  const categoryIds = (coupon.appliesTo?.categories ?? []).map(String);
  if (!productIds.length && !categoryIds.length) return lines;

  return lines.filter((line) => {
    if (productIds.includes(String(line.productId))) return true;
    if (line.categoryId && categoryIds.includes(String(line.categoryId))) return true;
    return false;
  });
}

async function countRedemptions({ coupon, user, email }) {
  const or = [];
  if (user?._id) or.push({ user: user._id });
  if (email) or.push({ email: String(email).toLowerCase() });
  if (!or.length) return 0;
  return CouponRedemption.countDocuments({ coupon, $or: or });
}

async function countCustomerOrders({ user, email }) {
  const or = [];
  if (user?._id) or.push({ user: user._id });
  if (email) or.push({ 'customer.email': String(email).toLowerCase() });
  if (!or.length) return 0;
  return Order.countDocuments({ $or: or, status: { $nin: ['cancelled'] } });
}

/**
 * Records a redemption and increments the global counter. Called only once a
 * payment is confirmed (or a COD order is accepted), so abandoned checkouts never
 * burn a coupon's usage allowance.
 */
export async function redeemCoupon({ couponId, code, user, email, order, discountAmount }, session) {
  const existing = await CouponRedemption.findOne({ coupon: couponId, order: order._id }).session(
    session ?? null
  );
  if (existing) return existing; // idempotent - a replayed callback must not double count

  const [redemption] = await CouponRedemption.create(
    [
      {
        coupon: couponId,
        code,
        user: user?._id ?? null,
        email: email ? String(email).toLowerCase() : undefined,
        order: order._id,
        discountAmount,
      },
    ],
    sessionOption(session)
  );

  await Coupon.updateOne({ _id: couponId }, { $inc: { usedCount: 1 } }, sessionOption(session));
  return redemption;
}

/** Reverses a redemption when an order is cancelled before fulfilment. */
export async function releaseCoupon({ couponId, orderId }, session) {
  const removed = await CouponRedemption.findOneAndDelete(
    { coupon: couponId, order: orderId },
    sessionOption(session)
  );
  if (removed) {
    await Coupon.updateOne(
      { _id: couponId, usedCount: { $gt: 0 } },
      { $inc: { usedCount: -1 } },
      sessionOption(session)
    );
  }
  return Boolean(removed);
}

export { DISCOUNT_TYPES };
export default { validateCoupon, redeemCoupon, releaseCoupon };
