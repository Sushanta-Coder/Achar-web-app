import AnalyticsEvent, { ANALYTICS_EVENTS } from '../models/AnalyticsEvent.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { track, getFunnel, getSearchTerms } from '../services/analyticsService.js';
import { resolveRange } from '../services/reportService.js';
import { NEPAL_TZ } from '../utils/nepalTime.js';

/**
 * First-party analytics.
 *
 * The public endpoint accepts the few events only the client can observe - a page
 * view, a checkout step reached, a search typed. Everything that happens on the
 * server (orders, payments, cart writes) is already tracked at its source, so the
 * client is never trusted to report it.
 *
 * That trust boundary is why `CLIENT_EVENTS` is a short allow-list rather than
 * `ANALYTICS_EVENTS`: without it, anyone could POST `purchase_completed` and make
 * the funnel report conversions that never happened.
 *
 * Responses are always 204. A tracking beacon must not tell a caller whether it
 * was accepted, must not slow the page down, and must not be worth retrying.
 */

const CLIENT_EVENTS = new Set(['product_view', 'checkout_started', 'search']);

/** `POST /api/analytics/track` - fire-and-forget beacon. */
export const trackEvent = asyncHandler(async (req, res) => {
  const { type, sessionId, product, meta } = req.body;

  if (CLIENT_EVENTS.has(type)) {
    // `track` sanitises meta, ignores unknown types and never throws.
    track({ type, sessionId, user: req.user, product, meta });
  }

  return res.status(204).end();
});

// --- Admin -------------------------------------------------------------------

/** Funnel counts plus the searches behind them, for the dashboard. */
export const funnel = asyncHandler(async (req, res) => {
  const range = req.query.range ?? '30d';
  const [conversion, searches] = await Promise.all([
    getFunnel({ range }),
    getSearchTerms({ range, limit: 20 }),
  ]);

  return sendSuccess(res, {
    data: { funnel: conversion, searches, range: resolveRange(range) },
  });
});

/** Search terms on their own, with the zero-result ones first-class. */
export const searchTerms = asyncHandler(async (req, res) => {
  const range = req.query.range ?? '30d';
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const terms = await getSearchTerms({ range, limit });

  return sendSuccess(res, {
    data: {
      terms,
      // Searches that found nothing are the most actionable list here: each one is
      // either a product worth stocking or a synonym worth adding.
      missed: terms.filter((term) => term.zeroResults > 0),
      range: resolveRange(range),
    },
  });
});

/**
 * Daily event counts by type, for the sparklines above the funnel. Grouped in
 * Mongo rather than fetched and reduced here, because an active month is tens of
 * thousands of rows.
 */
export const timeline = asyncHandler(async (req, res) => {
  const { from, to } = resolveRange(req.query.range ?? '30d');

  const rows = await AnalyticsEvent.aggregate([
    { $match: { createdAt: { $gte: from, $lte: to } } },
    {
      $group: {
        // Nepal-time buckets, matching the dashboard's day boundaries.
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: NEPAL_TZ } },
          type: '$type',
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.date': 1 } },
  ]);

  const byDate = new Map();
  for (const row of rows) {
    const entry = byDate.get(row._id.date) ?? { date: row._id.date };
    entry[row._id.type] = row.count;
    byDate.set(row._id.date, entry);
  }

  return sendSuccess(res, {
    data: {
      series: [...byDate.values()],
      types: ANALYTICS_EVENTS,
      range: { from, to },
    },
  });
});

export default { trackEvent, funnel, searchTerms, timeline };
