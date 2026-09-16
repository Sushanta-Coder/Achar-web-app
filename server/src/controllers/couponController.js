import Coupon from '../models/Coupon.js';
import CouponRedemption from '../models/CouponRedemption.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated, paginationMeta } from '../utils/ApiResponse.js';
import { parsePagination } from '../utils/pagination.js';
import { validateCoupon } from '../services/couponService.js';
import { priceCart } from '../services/pricingService.js';
import { quoteCart } from '../services/cartService.js';

/**
 * Coupons.
 *
 * The public endpoint reports whether a code applies to a specific cart and what it
 * would save - it never returns the coupon document, so the catalogue of active
 * codes is not enumerable, and the saving is always recomputed from live prices.
 */

export const validate = asyncHandler(async (req, res) => {
  const { code, items } = req.body;

  // A signed-in customer's stored cart is authoritative; guests post their items.
  const quote = req.user
    ? (await quoteCart({ user: req.user })).quote
    : await priceCart({ items: items ?? [] });

  if (!quote.lines.length) throw ApiError.badRequest('Add something to your cart first');

  const { coupon, discount, eligibleAmount } = await validateCoupon({
    code,
    lines: quote.lines,
    user: req.user,
    email: req.user?.email,
  });

  return sendSuccess(res, {
    message: `Coupon ${coupon.code} is valid`,
    data: {
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discount,
      eligibleAmount,
      newTotal: Math.max(0, quote.pricing.subtotal - discount),
    },
  });
});

/**
 * Codes the shop is happy to advertise: currently valid, with usage left, and not
 * restricted to specific products. Used by the "available offers" panel on the cart
 * page - a deliberate marketing choice, not a leak of every code.
 */
export const publicOffers = asyncHandler(async (_req, res) => {
  const now = new Date();
  const coupons = await Coupon.find({
    isActive: true,
    startsAt: { $lte: now },
    expiresAt: { $gt: now },
    'appliesTo.products': { $size: 0 },
    'appliesTo.categories': { $size: 0 },
  })
    .select('code description discountType discountValue minOrderAmount maxDiscountAmount expiresAt firstOrderOnly usageLimit usedCount')
    .sort({ minOrderAmount: 1 })
    .limit(6)
    .lean();

  return sendSuccess(res, {
    data: {
      offers: coupons
        .filter((coupon) => coupon.usageLimit === 0 || coupon.usedCount < coupon.usageLimit)
        .map(({ usageLimit, usedCount, ...offer }) => offer),
    },
  });
});

// --- Admin -------------------------------------------------------------------

export const adminList = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20 });
  const now = new Date();
  const filter = {};

  if (req.query.status === 'active') {
    Object.assign(filter, { isActive: true, startsAt: { $lte: now }, expiresAt: { $gt: now } });
  } else if (req.query.status === 'expired') {
    filter.expiresAt = { $lte: now };
  } else if (req.query.status === 'scheduled') {
    filter.startsAt = { $gt: now };
  } else if (req.query.status === 'disabled') {
    filter.isActive = false;
  }

  const [coupons, total] = await Promise.all([
    Coupon.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Coupon.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    data: {
      coupons: coupons.map((coupon) => ({
        ...coupon,
        state: couponState(coupon, now),
        remainingUses: coupon.usageLimit > 0 ? Math.max(0, coupon.usageLimit - coupon.usedCount) : null,
      })),
    },
    meta: paginationMeta({ page, limit, total }),
  });
});

const couponState = (coupon, now = new Date()) => {
  if (!coupon.isActive) return 'disabled';
  if (coupon.startsAt && coupon.startsAt > now) return 'scheduled';
  if (coupon.expiresAt && coupon.expiresAt <= now) return 'expired';
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) return 'exhausted';
  return 'active';
};

export const adminGetById = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id).lean();
  if (!coupon) throw ApiError.notFound('Coupon not found');

  const redemptions = await CouponRedemption.find({ coupon: coupon._id })
    .select('code email discountAmount order createdAt user')
    .populate('order', 'orderNumber pricing.total')
    .populate('user', 'name email')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const [totals] = await CouponRedemption.aggregate([
    { $match: { coupon: coupon._id } },
    { $group: { _id: null, count: { $sum: 1 }, discountGiven: { $sum: '$discountAmount' } } },
  ]);

  return sendSuccess(res, {
    data: {
      coupon: { ...coupon, state: couponState(coupon) },
      redemptions,
      stats: { redemptions: totals?.count ?? 0, discountGiven: totals?.discountGiven ?? 0 },
    },
  });
});

export const create = asyncHandler(async (req, res) => {
  const body = { ...req.body };

  if (await Coupon.exists({ code: body.code })) {
    throw ApiError.conflict('That coupon code already exists', {
      details: { code: 'That coupon code already exists' },
    });
  }

  // An expiry is required by the model; default to a month out rather than rejecting
  // a form that otherwise looks complete.
  if (!body.expiresAt) {
    body.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }
  if (body.maxDiscountAmount === 0) body.maxDiscountAmount = null;

  const coupon = await Coupon.create(body);
  return sendCreated(res, { message: `Coupon ${coupon.code} created`, data: { coupon } });
});

export const update = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) throw ApiError.notFound('Coupon not found');

  const body = { ...req.body };
  if (body.maxDiscountAmount === 0) body.maxDiscountAmount = null;
  // The code itself is immutable once created: redemptions reference it by name.
  delete body.code;

  coupon.set(body);
  await coupon.save();

  return sendSuccess(res, { message: 'Coupon updated', data: { coupon } });
});

/**
 * A coupon that has been used is disabled rather than deleted, so the discount on a
 * historical order can still be explained.
 */
export const remove = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) throw ApiError.notFound('Coupon not found');

  if (coupon.usedCount > 0) {
    coupon.isActive = false;
    await coupon.save();
    return sendSuccess(res, {
      message: 'This coupon has been used, so it was disabled instead of deleted',
      data: { disabled: true },
    });
  }

  await coupon.deleteOne();
  return sendSuccess(res, { message: 'Coupon deleted', data: { disabled: false } });
});

export default { validate, publicOffers, adminList, adminGetById, create, update, remove };
