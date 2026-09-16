import Review from '../models/Review.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated, paginationMeta } from '../utils/ApiResponse.js';
import { parsePagination } from '../utils/pagination.js';
import { getSettings } from '../services/settingsService.js';
import { stripTags } from '../utils/sanitize.js';
import { REVIEW_STATUS, ORDER_STATUS } from '../utils/constants.js';
import logger from '../config/logger.js';

/**
 * Product reviews.
 *
 * Two rules make the ratings trustworthy, and they are enforced here rather than
 * in the UI:
 *   1. a review requires a *delivered* order containing that product, so the
 *      "Verified purchase" badge is a fact and not a decoration
 *   2. reviews are `pending` until a moderator approves them, so nothing reaches
 *      the storefront unread
 *
 * `ratingAverage` / `ratingCount` on the product are always recomputed from the
 * approved rows - never incremented - so an edit, a rejection or a delete can
 * never leave the average drifting away from the reviews on display.
 */

/** Author identity published with a review: first name only, never the email. */
const publicAuthor = (user) => (user?.name ? user.name.split(' ')[0] : 'Customer');

const publicReview = (review) => ({
  id: String(review._id),
  rating: review.rating,
  title: review.title,
  comment: review.comment,
  images: review.images,
  isVerifiedPurchase: review.isVerifiedPurchase,
  helpfulCount: review.helpfulCount,
  adminResponse: review.adminResponse,
  author: publicAuthor(review.user),
  createdAt: review.createdAt,
});

const SORTS = {
  newest: { createdAt: -1 },
  helpful: { helpfulCount: -1, createdAt: -1 },
  'rating-high': { rating: -1, createdAt: -1 },
  'rating-low': { rating: 1, createdAt: -1 },
};

/**
 * Recomputes a product's rating from its approved reviews.
 *
 * Called after every write that could change the set. Deliberately a full
 * recount rather than an increment: an aggregate that can only be nudged
 * eventually disagrees with the reviews a customer can actually read.
 */
export async function recalculateProductRating(productId) {
  const [row] = await Review.aggregate([
    { $match: { product: productId, status: REVIEW_STATUS.APPROVED } },
    { $group: { _id: null, count: { $sum: 1 }, average: { $avg: '$rating' } } },
  ]);

  await Product.updateOne(
    { _id: productId },
    {
      $set: {
        ratingCount: row?.count ?? 0,
        ratingAverage: row ? Math.round(row.average * 10) / 10 : 0,
      },
    }
  );
}

// --- Public ------------------------------------------------------------------

/** Approved reviews for one product, with the star breakdown for the widget. */
export const listForProduct = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 10 });

  const product = await Product.findOne({ slug: req.params.slug }).select('_id').lean();
  if (!product) throw ApiError.notFound('Product not found');

  const filter = { product: product._id, status: REVIEW_STATUS.APPROVED };
  if (req.query.rating) filter.rating = Number(req.query.rating);

  const [reviews, total, breakdown] = await Promise.all([
    Review.find(filter)
      .populate('user', 'name')
      .sort(SORTS[req.query.sort ?? 'newest'])
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments(filter),
    ratingBreakdown(product._id),
  ]);

  return sendSuccess(res, {
    data: { reviews: reviews.map(publicReview), breakdown },
    meta: paginationMeta({ page, limit, total }),
  });
});

async function ratingBreakdown(productId) {
  const rows = await Review.aggregate([
    { $match: { product: productId, status: REVIEW_STATUS.APPROVED } },
    { $group: { _id: '$rating', count: { $sum: 1 } } },
  ]);

  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  rows.forEach((row) => {
    counts[row._id] = row.count;
  });
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const sum = rows.reduce((acc, row) => acc + row._id * row.count, 0);

  return { counts, total, average: total ? Math.round((sum / total) * 10) / 10 : 0 };
}

/**
 * Marks a review helpful. Anonymous and idempotent-ish by design: there is no
 * per-visitor record, because storing one would mean identifying visitors to
 * protect a vanity counter. The client disables the button locally.
 */
export const markHelpful = asyncHandler(async (req, res) => {
  const review = await Review.findOneAndUpdate(
    { _id: req.params.id, status: REVIEW_STATUS.APPROVED },
    { $inc: { helpfulCount: 1 } },
    { new: true, projection: 'helpfulCount' }
  );
  if (!review) throw ApiError.notFound('Review not found');

  return sendSuccess(res, { data: { helpfulCount: review.helpfulCount } });
});

// --- Customer ----------------------------------------------------------------

/**
 * Finds the delivered order that entitles this customer to review a product.
 * Returns `null` when there is none, so the caller decides whether that is fatal.
 */
async function findEntitlingOrder({ userId, productId, orderId }) {
  const filter = {
    user: userId,
    status: ORDER_STATUS.DELIVERED,
    'items.product': productId,
  };
  if (orderId) filter._id = orderId;

  return Order.findOne(filter).select('_id').sort({ deliveredAt: -1 }).lean();
}

export const create = asyncHandler(async (req, res) => {
  const { productId, orderId, rating, title, comment, images } = req.body;

  const [product, settings] = await Promise.all([
    Product.findById(productId).select('_id name').lean(),
    getSettings(),
  ]);
  if (!product) throw ApiError.notFound('Product not found');

  if (await Review.exists({ product: product._id, user: req.user._id })) {
    throw ApiError.conflict('You have already reviewed this product - you can edit that review');
  }

  const order = await findEntitlingOrder({
    userId: req.user._id,
    productId: product._id,
    orderId,
  });

  if (!order && settings.commerce.requireDeliveredOrderForReview) {
    throw ApiError.forbidden(
      'Reviews can be written once your order has been delivered. Thank you for your patience.'
    );
  }

  // The delivered-order requirement is a setting the shop can relax, but the
  // record stays honest: `isVerifiedPurchase` reflects whether an order backs it,
  // so the storefront badge never claims more than we know.
  const autoApprove = Boolean(settings.commerce.autoApproveReviews);

  const review = await Review.create({
    product: product._id,
    user: req.user._id,
    order: order?._id ?? null,
    rating,
    title: stripTags(title),
    comment: stripTags(comment),
    images: (images ?? []).map((url) => ({ url, alt: `Customer photo of ${product.name}` })),
    isVerifiedPurchase: Boolean(order),
    status: autoApprove ? REVIEW_STATUS.APPROVED : REVIEW_STATUS.PENDING,
  });

  if (autoApprove) await recalculateProductRating(product._id);

  return sendCreated(res, {
    message: autoApprove
      ? 'Thank you - your review is now live'
      : 'Thank you - your review will appear once it has been checked',
    data: { review: { id: String(review._id), status: review.status } },
  });
});

export const myReviews = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 10 });
  const filter = { user: req.user._id };

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .populate('product', 'name slug thumbnail')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    data: { reviews },
    meta: paginationMeta({ page, limit, total }),
  });
});

/**
 * Products this customer has received but not yet reviewed - the "Write a review"
 * prompts on the account page.
 */
export const reviewable = asyncHandler(async (req, res) => {
  const [orders, reviewed] = await Promise.all([
    Order.find({ user: req.user._id, status: ORDER_STATUS.DELIVERED })
      .select('orderNumber deliveredAt items.product items.name items.slug items.image')
      .sort({ deliveredAt: -1 })
      .limit(30)
      .lean(),
    Review.find({ user: req.user._id }).select('product').lean(),
  ]);

  const alreadyReviewed = new Set(reviewed.map((review) => String(review.product)));
  const seen = new Set();
  const pending = [];

  for (const order of orders) {
    for (const item of order.items) {
      const key = String(item.product);
      if (!item.product || alreadyReviewed.has(key) || seen.has(key)) continue;
      seen.add(key);
      pending.push({
        productId: key,
        orderId: String(order._id),
        orderNumber: order.orderNumber,
        name: item.name,
        slug: item.slug,
        image: item.image,
        deliveredAt: order.deliveredAt,
      });
    }
  }

  return sendSuccess(res, { data: { products: pending } });
});

/**
 * An edited review returns to moderation: otherwise an approved review could be
 * rewritten into anything after the fact.
 */
export const update = asyncHandler(async (req, res) => {
  const review = await Review.findOne({ _id: req.params.id, user: req.user._id });
  if (!review) throw ApiError.notFound('Review not found');

  if (req.body.rating !== undefined) review.rating = req.body.rating;
  if (req.body.title !== undefined) review.title = stripTags(req.body.title);
  if (req.body.comment) review.comment = stripTags(req.body.comment);

  const wasApproved = review.status === REVIEW_STATUS.APPROVED;
  review.status = REVIEW_STATUS.PENDING;
  review.moderationNote = undefined;
  await review.save();

  if (wasApproved) await recalculateProductRating(review.product);

  return sendSuccess(res, {
    message: 'Your review has been updated and will reappear once it has been checked',
    data: { review: { id: String(review._id), status: review.status } },
  });
});

export const remove = asyncHandler(async (req, res) => {
  const review = await Review.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!review) throw ApiError.notFound('Review not found');

  await recalculateProductRating(review.product);
  return sendSuccess(res, { message: 'Your review has been removed' });
});

// --- Admin -------------------------------------------------------------------

export const adminList = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20 });
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.rating) filter.rating = Number(req.query.rating);

  const [reviews, total, counts] = await Promise.all([
    Review.find(filter)
      .populate('product', 'name slug thumbnail')
      .populate('user', 'name email')
      .sort(SORTS[req.query.sort ?? 'newest'])
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments(filter),
    Review.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  return sendSuccess(res, {
    data: {
      reviews,
      counts: counts.reduce((acc, row) => ({ ...acc, [row._id]: row.count }), {
        pending: 0,
        approved: 0,
        rejected: 0,
      }),
    },
    meta: paginationMeta({ page, limit, total }),
  });
});

export const adminModerate = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) throw ApiError.notFound('Review not found');

  review.status = req.body.status;
  if (req.body.moderationNote !== undefined) review.moderationNote = req.body.moderationNote;
  if (req.body.adminResponse !== undefined) review.adminResponse = stripTags(req.body.adminResponse);
  await review.save();

  await recalculateProductRating(review.product);

  return sendSuccess(res, {
    message: `Review ${req.body.status}`,
    data: { review: { id: String(review._id), status: review.status } },
  });
});

export const adminRemove = asyncHandler(async (req, res) => {
  const review = await Review.findByIdAndDelete(req.params.id);
  if (!review) throw ApiError.notFound('Review not found');

  await recalculateProductRating(review.product);
  return sendSuccess(res, { message: 'Review deleted' });
});

/**
 * Maintenance: rebuilds every product's rating from its approved reviews. Useful
 * after a bulk import or if a crash interrupted a moderation write.
 */
export const adminRecalculateAll = asyncHandler(async (_req, res) => {
  const rows = await Review.aggregate([
    { $match: { status: REVIEW_STATUS.APPROVED } },
    { $group: { _id: '$product', count: { $sum: 1 }, average: { $avg: '$rating' } } },
  ]);

  const rated = new Map(rows.map((row) => [String(row._id), row]));
  const products = await Product.find().select('_id ratingCount ratingAverage').lean();

  const operations = products
    .map((product) => {
      const row = rated.get(String(product._id));
      const ratingCount = row?.count ?? 0;
      const ratingAverage = row ? Math.round(row.average * 10) / 10 : 0;
      if (product.ratingCount === ratingCount && product.ratingAverage === ratingAverage) {
        return null;
      }
      return {
        updateOne: { filter: { _id: product._id }, update: { $set: { ratingCount, ratingAverage } } },
      };
    })
    .filter(Boolean);

  if (operations.length) await Product.bulkWrite(operations);
  logger.info(`Recalculated ratings for ${operations.length} product(s)`);

  return sendSuccess(res, {
    message: `Ratings rebuilt for ${operations.length} product(s)`,
    data: { updated: operations.length, checked: products.length },
  });
});

export default {
  listForProduct,
  markHelpful,
  create,
  myReviews,
  reviewable,
  update,
  remove,
  adminList,
  adminModerate,
  adminRemove,
  adminRecalculateAll,
  recalculateProductRating,
};
