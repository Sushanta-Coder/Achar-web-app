import { Router } from 'express';
import * as reviews from '../controllers/reviewController.js';
import { requireAuth, requireStaff } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { publicWriteLimiter } from '../middleware/rateLimiter.js';
import {
  createReviewSchema,
  updateReviewSchema,
  moderateReviewSchema,
  reviewListQuery,
} from '../validators/contentValidators.js';
import { idParams, slugParams } from '../validators/common.js';

/**
 * `/api/reviews`
 *
 * Writing a review requires a session, and (when the shop has that setting on) a
 * delivered order containing the product - enforced in the controller, not here,
 * because it is a business rule an admin can toggle.
 *
 * `markHelpful` is intentionally open to any signed-in customer but scoped to
 * approved reviews only, so an unpublished review cannot be voted into visibility.
 */
const router = Router();

router.get(
  '/product/:slug',
  validate({ params: slugParams, query: reviewListQuery }),
  reviews.listForProduct
);

// --- Admin (before `/:id`, so "admin" is never read as a review id) -----------

router.get('/admin/list', requireAuth, requireStaff, validate({ query: reviewListQuery }), reviews.adminList);
router.patch(
  '/admin/:id',
  requireAuth,
  requireStaff,
  validate({ params: idParams, body: moderateReviewSchema }),
  reviews.adminModerate
);
router.delete('/admin/:id', requireAuth, requireStaff, validate({ params: idParams }), reviews.adminRemove);
router.post('/admin/recalculate', requireAuth, requireStaff, reviews.adminRecalculateAll);

// --- Customer ----------------------------------------------------------------

router.use(requireAuth);

router.get('/mine', validate({ query: reviewListQuery }), reviews.myReviews);
router.get('/reviewable', reviews.reviewable);

router.post('/', publicWriteLimiter, validate({ body: createReviewSchema }), reviews.create);
router.patch('/:id', validate({ params: idParams, body: updateReviewSchema }), reviews.update);
router.delete('/:id', validate({ params: idParams }), reviews.remove);
router.post('/:id/helpful', validate({ params: idParams }), reviews.markHelpful);

export default router;
