import { Router } from 'express';
import * as delivery from '../controllers/deliveryController.js';
import { requireAuth, requireStaff } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { readHeavyLimiter } from '../middleware/rateLimiter.js';
import { deliveryQuoteQuery } from '../validators/orderValidators.js';
import {
  createDeliveryZoneSchema,
  updateDeliveryZoneSchema,
  districtCheckQuery,
} from '../validators/contentValidators.js';
import { idParams } from '../validators/common.js';

/**
 * `/api/delivery`
 *
 * `/quote` is a read: it takes a district and a goods subtotal and answers with a
 * charge. It never accepts a charge, so calling it cannot influence what an order is
 * billed - checkout re-quotes server-side from the saved address regardless of what
 * the browser was shown.
 *
 * That is also why it is safe behind only the read limiter: the cart calls it on
 * every address change.
 */
const router = Router();

router.get('/quote', readHeavyLimiter, validate({ query: deliveryQuoteQuery }), delivery.quote);
/** The full zone/charge table for the Shipping Policy page. */
router.get('/table', delivery.table);
router.get(
  '/check',
  readHeavyLimiter,
  validate({ query: districtCheckQuery }),
  delivery.checkDistrict
);

// --- Admin -------------------------------------------------------------------

router.use('/admin', requireAuth, requireStaff);

router.get('/admin/zones', delivery.adminList);
router.post('/admin/zones', validate({ body: createDeliveryZoneSchema }), delivery.create);
router.get('/admin/zones/:id', validate({ params: idParams }), delivery.adminGetById);
router.patch(
  '/admin/zones/:id',
  validate({ params: idParams, body: updateDeliveryZoneSchema }),
  delivery.update
);
/**
 * The controller refuses to delete the default zone. Without a fallback, a district
 * covered by no explicit zone would become undeliverable at checkout rather than
 * merely expensive - a silent loss of orders.
 */
router.delete('/admin/zones/:id', validate({ params: idParams }), delivery.remove);

export default router;
