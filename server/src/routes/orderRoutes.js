import { Router } from 'express';
import * as orders from '../controllers/orderController.js';
import { optionalAuth, requireAuth, requireStaff } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { checkoutLimiter, lookupLimiter } from '../middleware/rateLimiter.js';
import {
  createOrderSchema,
  orderListQuery,
  orderNumberParams,
  trackOrderSchema,
  cancelOrderSchema,
  guestTokenQuery,
  updateOrderStatusSchema,
  adminNoteSchema,
} from '../validators/orderValidators.js';
import { idParams } from '../validators/common.js';

/**
 * `/api/orders`
 *
 * Guest checkout is a first-class path, so `create` takes `optionalAuth` rather than
 * `requireAuth`. A guest's proof of ownership afterwards is the stateless access
 * token issued at checkout and carried in `?token=` - `assertCanViewOrder` inside the
 * controller is the single place that rule lives.
 *
 * `/mine` and the `/admin/*` block are declared before `/:orderNumber`, or "mine" and
 * "admin" would be parsed as order numbers.
 */
const router = Router();

router.get('/checkout-context', optionalAuth, orders.checkoutContext);

router.post(
  '/',
  optionalAuth,
  checkoutLimiter,
  validate({ body: createOrderSchema }),
  orders.create
);

// Tracking by order number + phone/email. Rate-limited as the enumeration surface
// it is, but generously enough that refreshing the page is never punished.
router.post('/track', lookupLimiter, validate({ body: trackOrderSchema }), orders.trackOrder);

router.get('/mine', requireAuth, validate({ query: orderListQuery }), orders.myOrders);

router.post(
  '/:id/cancel',
  requireAuth,
  validate({ params: idParams, body: cancelOrderSchema }),
  orders.cancel
);

// --- Admin order management ---------------------------------------------------

/**
 * Staff, not admin-only: fulfilling orders is the day-to-day job these accounts
 * exist for. Every route here is above `/:orderNumber` so that "admin" is never
 * matched as an order number, and `/admin/status-counts` is above `/admin/:id` for
 * the same reason.
 *
 * Status changes go through `updateOrderStatus` in the order service rather than a
 * direct write: that function owns the legal-transition check and the stock
 * consequences (a cancellation has to release reserved units, a delivery has to
 * deduct them), and bypassing it would let the admin UI corrupt inventory.
 */
router.use('/admin', requireAuth, requireStaff);

router.get('/admin/status-counts', orders.adminStatusCounts);
router.get('/admin/list', validate({ query: orderListQuery }), orders.adminList);
router.get('/admin/:id', validate({ params: idParams }), orders.adminGetById);
router.patch(
  '/admin/:id/status',
  validate({ params: idParams, body: updateOrderStatusSchema }),
  orders.adminUpdateStatus
);
router.patch(
  '/admin/:id/note',
  validate({ params: idParams, body: adminNoteSchema }),
  orders.adminUpdateNote
);

// --- Customer-facing lookups (last: `/:orderNumber` matches anything) ---------

router.get(
  '/:orderNumber',
  optionalAuth,
  validate({ params: orderNumberParams, query: guestTokenQuery }),
  orders.getByOrderNumber
);
router.get(
  '/:orderNumber/invoice',
  optionalAuth,
  validate({ params: orderNumberParams, query: guestTokenQuery }),
  orders.invoice
);

export default router;
