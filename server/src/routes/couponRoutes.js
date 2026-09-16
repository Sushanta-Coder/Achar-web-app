import { Router } from 'express';
import * as coupons from '../controllers/couponController.js';
import { optionalAuth, requireAuth, requireStaff } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { readHeavyLimiter } from '../middleware/rateLimiter.js';
import {
  createCouponSchema,
  updateCouponSchema,
  validateCouponSchema,
  couponListQuery,
} from '../validators/contentValidators.js';
import { idParams } from '../validators/common.js';

/**
 * `/api/coupons`
 *
 * `/validate` takes `optionalAuth` because per-customer usage limits and
 * "first order only" can only be checked when we know who is asking - a guest gets
 * the generic rules, a signed-in customer gets their own.
 *
 * The public offers list only ever exposes coupons the shop has chosen to advertise;
 * a code that is not marked public stays unguessable.
 */
const router = Router();

router.get('/offers', coupons.publicOffers);
router.post(
  '/validate',
  optionalAuth,
  readHeavyLimiter,
  validate({ body: validateCouponSchema }),
  coupons.validate
);

router.use(requireAuth, requireStaff);

router.get('/admin/list', validate({ query: couponListQuery }), coupons.adminList);
router.post('/admin', validate({ body: createCouponSchema }), coupons.create);
router.get('/admin/:id', validate({ params: idParams }), coupons.adminGetById);
router.patch('/admin/:id', validate({ params: idParams, body: updateCouponSchema }), coupons.update);
router.delete('/admin/:id', validate({ params: idParams }), coupons.remove);

export default router;
