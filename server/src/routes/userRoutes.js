import { Router } from 'express';
import * as user from '../controllers/userController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import {
  updateProfileSchema,
  addressSchema,
  addressParams,
  deleteAccountSchema,
} from '../validators/authValidators.js';

/** `/api/users` - the signed-in customer's own account. Never another customer's. */
const router = Router();

router.use(requireAuth);

router.get('/me', user.getProfile);
router.patch('/me', validate({ body: updateProfileSchema }), user.updateProfile);
router.get('/me/summary', user.getAccountSummary);

router.get('/me/addresses', user.listAddresses);
router.post('/me/addresses', validate({ body: addressSchema }), user.addAddress);
// The full schema on update, not a partial one: the address form always submits
// every field, and a partial payload would skip the province/district cross-check
// that stops an order being addressed to a district in the wrong province.
router.patch(
  '/me/addresses/:addressId',
  validate({ params: addressParams, body: addressSchema }),
  user.updateAddress
);
router.delete('/me/addresses/:addressId', validate({ params: addressParams }), user.deleteAddress);
router.post(
  '/me/addresses/:addressId/default',
  validate({ params: addressParams }),
  user.setDefaultAddress
);

// Password-confirmed and rate-limited: an irreversible action reached by one click
// on a shared laptop is a support ticket waiting to happen.
router.post(
  '/me/delete',
  authLimiter,
  validate({ body: deleteAccountSchema }),
  user.deleteAccount
);

export default router;
