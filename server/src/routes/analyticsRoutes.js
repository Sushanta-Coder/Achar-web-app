import { Router } from 'express';
import * as analytics from '../controllers/analyticsController.js';
import { optionalAuth, requireAuth, requireStaff } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { readHeavyLimiter } from '../middleware/rateLimiter.js';
import { analyticsEventSchema, analyticsRangeQuery } from '../validators/contentValidators.js';

/**
 * `/api/analytics`
 *
 * First-party only. There is no third-party tag on the storefront, so this endpoint
 * is what the funnel report is built from: product views, add-to-carts, searches.
 *
 * `/track` is an anonymous write, which would normally sit behind
 * `publicWriteLimiter` - but a browsing session legitimately fires dozens of these,
 * so it takes the read limiter instead. What makes that acceptable is that the event
 * carries no free-form text the shop will ever display: `type` is checked against an
 * allow-list in the controller and anything unrecognised is dropped silently.
 */
const router = Router();

router.post(
  '/track',
  readHeavyLimiter,
  optionalAuth,
  validate({ body: analyticsEventSchema }),
  analytics.trackEvent
);

// --- Admin -------------------------------------------------------------------

router.use(requireAuth, requireStaff);

/** View -> cart -> checkout -> paid, with the drop-off between each pair. */
router.get('/funnel', validate({ query: analyticsRangeQuery }), analytics.funnel);
/** What people searched for, and how often it returned nothing - the merchandising gap. */
router.get('/search-terms', validate({ query: analyticsRangeQuery }), analytics.searchTerms);
router.get('/timeline', validate({ query: analyticsRangeQuery }), analytics.timeline);

export default router;
