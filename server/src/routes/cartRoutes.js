import { Router } from 'express';
import * as cart from '../controllers/cartController.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { readHeavyLimiter } from '../middleware/rateLimiter.js';
import {
  addToCartSchema,
  updateCartItemSchema,
  cartItemParams,
  applyCouponSchema,
  previewCouponSchema,
  mergeCartSchema,
  quoteSchema,
} from '../validators/orderValidators.js';

/**
 * `/api/cart`
 *
 * `/quote` and `/coupon/preview` take `optionalAuth`: a guest posts their
 * localStorage cart, a signed-in customer's stored cart wins and the posted items
 * are ignored. Everything that *mutates* a stored cart requires a session.
 *
 * Neither path accepts an amount, so quoting is safe to call on every keystroke -
 * hence `readHeavyLimiter` rather than a write limiter.
 */
const router = Router();

router.post('/quote', optionalAuth, readHeavyLimiter, validate({ body: quoteSchema }), cart.quote);
router.post(
  '/coupon/preview',
  optionalAuth,
  readHeavyLimiter,
  validate({ body: previewCouponSchema }),
  cart.previewCoupon
);

router.use(requireAuth);

router.get('/', cart.getCart);
router.post('/items', validate({ body: addToCartSchema }), cart.addToCart);
router.patch(
  '/items/:itemId',
  validate({ params: cartItemParams, body: updateCartItemSchema }),
  cart.updateCartItem
);
router.delete('/items/:itemId', validate({ params: cartItemParams }), cart.removeCartItem);
router.delete('/', cart.emptyCart);

router.post('/coupon', validate({ body: applyCouponSchema }), cart.applyCoupon);
router.delete('/coupon', cart.removeCoupon);

// Called once, immediately after sign-in, to fold the guest cart into the stored one.
router.post('/merge', validate({ body: mergeCartSchema }), cart.merge);

export default router;
