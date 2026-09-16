import { Router } from 'express';
import * as auth from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter, readHeavyLimiter } from '../middleware/rateLimiter.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  verifyEmailSchema,
  adminLoginSchema,
  availabilityQuery,
} from '../validators/authValidators.js';

/**
 * `/api/auth`
 *
 * Every credential-accepting route sits behind `authLimiter`, which is much
 * stricter than the global limiter: these are the endpoints worth brute-forcing.
 *
 * Note that `refresh` and `logout` live under this path deliberately - the refresh
 * cookie is scoped to `/api/auth`, so it is never sent to any other endpoint. A
 * leak in an unrelated handler cannot expose it.
 */
const router = Router();

router.post('/register', authLimiter, validate({ body: registerSchema }), auth.register);
router.post('/login', authLimiter, validate({ body: loginSchema }), auth.login);
router.post('/admin/login', authLimiter, validate({ body: adminLoginSchema }), auth.adminLogin);

router.post('/refresh', auth.refresh);
router.post('/logout', auth.logout);

router.post(
  '/forgot-password',
  authLimiter,
  validate({ body: forgotPasswordSchema }),
  auth.forgotPassword
);
router.post(
  '/reset-password',
  authLimiter,
  validate({ body: resetPasswordSchema }),
  auth.resetPassword
);
router.post('/verify-email', authLimiter, validate({ body: verifyEmailSchema }), auth.verifyEmail);

router.get('/availability', readHeavyLimiter, validate({ query: availabilityQuery }), auth.checkAvailability);

router.get('/me', requireAuth, auth.me);
router.post(
  '/change-password',
  requireAuth,
  authLimiter,
  validate({ body: changePasswordSchema }),
  auth.changePassword
);
router.post('/logout-everywhere', requireAuth, auth.logoutEverywhere);

export default router;
