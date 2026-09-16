import AnalyticsEvent, { ANALYTICS_EVENTS } from '../models/AnalyticsEvent.js';
import logger from '../config/logger.js';
import env from '../config/env.js';
import { resolveRange } from './reportService.js';

/**
 * First-party funnel analytics.
 *
 * Deliberately minimal: an event type, an anonymous session id and a small meta
 * payload. No IP addresses, no fingerprints, nothing that needs a cookie banner.
 * `track` never awaits and never throws, so instrumenting a route can never break it.
 *
 * A larger deployment would forward these to GA4 or Plausible instead; that swap
 * happens inside `track` and nowhere else.
 */

const ALLOWED_META_KEYS = new Set([
  'term',
  'code',
  'value',
  'quantity',
  'path',
  'orderNumber',
  'gateway',
  'variantId',
  'resultCount',
]);

/** Keeps arbitrary client-supplied objects out of the collection. */
function sanitiseMeta(meta = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(meta)) {
    if (!ALLOWED_META_KEYS.has(key)) continue;
    if (typeof value === 'string') clean[key] = value.slice(0, 120);
    else if (typeof value === 'number' && Number.isFinite(value)) clean[key] = value;
    else if (value === null || typeof value === 'boolean') clean[key] = value;
  }
  return clean;
}

export function track({ type, sessionId, user, product, meta } = {}) {
  if (env.isTest) return;
  if (!ANALYTICS_EVENTS.includes(type) || !sessionId) return;

  AnalyticsEvent.create({
    type,
    sessionId: String(sessionId).slice(0, 64),
    user: user?._id ?? null,
    product: product ?? null,
    meta: sanitiseMeta(meta),
  }).catch((error) => logger.warn(`Analytics event dropped (${type}): ${error.message}`));
}

/** Conversion funnel counts for the admin dashboard. */
export async function getFunnel({ range = '30d' } = {}) {
  const { from, to } = resolveRange(range);

  const rows = await AnalyticsEvent.aggregate([
    { $match: { createdAt: { $gte: from, $lte: to } } },
    { $group: { _id: '$type', events: { $sum: 1 }, sessions: { $addToSet: '$sessionId' } } },
    { $project: { events: 1, sessions: { $size: '$sessions' } } },
  ]);

  const byType = Object.fromEntries(rows.map((row) => [row._id, row]));
  const step = (type) => byType[type]?.sessions ?? 0;

  const views = step('product_view');
  const carts = step('add_to_cart');
  const checkouts = step('checkout_started');
  const purchases = step('purchase_completed');

  return {
    steps: [
      { key: 'product_view', label: 'Viewed a product', sessions: views },
      { key: 'add_to_cart', label: 'Added to cart', sessions: carts },
      { key: 'checkout_started', label: 'Started checkout', sessions: checkouts },
      { key: 'purchase_completed', label: 'Completed purchase', sessions: purchases },
    ],
    rates: {
      viewToCart: rate(carts, views),
      cartToCheckout: rate(checkouts, carts),
      checkoutToPurchase: rate(purchases, checkouts),
      overall: rate(purchases, views),
    },
    raw: byType,
  };
}

const rate = (numerator, denominator) =>
  denominator ? Math.round((numerator / denominator) * 1000) / 10 : 0;

/** What customers search for, including the searches that found nothing. */
export async function getSearchTerms({ range = '30d', limit = 20 } = {}) {
  const { from, to } = resolveRange(range);

  return AnalyticsEvent.aggregate([
    { $match: { type: 'search', createdAt: { $gte: from, $lte: to }, 'meta.term': { $ne: null } } },
    {
      $group: {
        _id: { $toLower: '$meta.term' },
        searches: { $sum: 1 },
        zeroResults: { $sum: { $cond: [{ $eq: ['$meta.resultCount', 0] }, 1, 0] } },
      },
    },
    { $project: { _id: 0, term: '$_id', searches: 1, zeroResults: 1 } },
    { $sort: { searches: -1 } },
    { $limit: limit },
  ]);
}

export default { track, getFunnel, getSearchTerms };
