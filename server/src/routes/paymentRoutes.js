import { Router } from 'express';
import * as payments from '../controllers/paymentController.js';
import { optionalAuth, requireAuth, requireStaff, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { paymentLimiter } from '../middleware/rateLimiter.js';
import {
  initiatePaymentSchema,
  khaltiCallbackQuery,
  esewaCallbackQuery,
  refundSchema,
  guestTokenQuery,
  orderNumberParams,
  paymentListQuery,
} from '../validators/orderValidators.js';
import { idParams } from '../validators/common.js';

/**
 * `/api/payments`
 *
 * The gateway callbacks are the security-critical routes in this file, and they are
 * deliberately plain: no auth, no CSRF, because the caller is a browser being
 * redirected back from Khalti or eSewa and carries none of our cookies.
 *
 * What makes that safe is that the callback is *not trusted*. It supplies only a
 * reference; the controller then calls the gateway's own lookup API server-side and
 * settles the order from that answer. A forged callback verifies as unpaid and
 * changes nothing. See `services/payments/PaymentService.js`.
 *
 * Both verbs are registered for each callback: Khalti redirects with a GET, eSewa
 * posts its base64 `data` payload, and a gateway changing its mind about the method
 * should not take the shop's payments down.
 */
const router = Router();

router.get('/methods', payments.methods);

router.post(
  '/initiate',
  optionalAuth,
  paymentLimiter,
  validate({ body: initiatePaymentSchema }),
  payments.initiate
);

router
  .route('/khalti/callback')
  .get(validate({ query: khaltiCallbackQuery }), payments.khaltiCallback)
  .post(validate({ query: khaltiCallbackQuery }), payments.khaltiCallback);

router
  .route('/esewa/callback')
  .get(validate({ query: esewaCallbackQuery }), payments.esewaCallback)
  .post(validate({ query: esewaCallbackQuery }), payments.esewaCallback);

router.get(
  '/status/:orderNumber',
  optionalAuth,
  validate({ params: orderNumberParams, query: guestTokenQuery }),
  payments.status
);

// --- Admin -------------------------------------------------------------------

router.get(
  '/admin/list',
  requireAuth,
  requireStaff,
  validate({ query: paymentListQuery }),
  payments.adminList
);
router.get('/admin/attention', requireAuth, requireStaff, payments.adminAttentionList);
router.get('/admin/:id', requireAuth, requireStaff, validate({ params: idParams }), payments.adminGetById);

/**
 * Re-runs verification against the gateway for a payment stuck in `pending` - the
 * fix for a customer who closed the tab before being redirected back.
 */
router.post(
  '/admin/:id/reconcile',
  requireAuth,
  requireStaff,
  validate({ params: idParams }),
  payments.adminReconcile
);

// Refunds move money in the real world, so admin-only rather than staff.
router.post(
  '/admin/:id/refund',
  requireAuth,
  requireAdmin,
  validate({ params: idParams, body: refundSchema }),
  payments.adminRecordRefund
);

export default router;
