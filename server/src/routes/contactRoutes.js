import { Router } from 'express';
import * as contact from '../controllers/contactController.js';
import { optionalAuth, requireAuth, requireStaff } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { publicWriteLimiter } from '../middleware/rateLimiter.js';
import {
  contactSchema,
  newsletterSchema,
  unsubscribeSchema,
  unsubscribeQuery,
  contactListQuery,
  contactUpdateSchema,
  subscriberListQuery,
} from '../validators/contentValidators.js';
import { idParams } from '../validators/common.js';

/**
 * `/api/contact`
 *
 * Three unauthenticated writes live here, so all three sit behind
 * `publicWriteLimiter`. They are the shop's only anonymous inserts: without a cap,
 * the enquiries table is a free-form store anyone can fill.
 *
 * `subscribe` takes `optionalAuth` so a signed-in customer's newsletter signup can be
 * attributed to them; a guest simply records the anonymous session id.
 */
const router = Router();

router.post('/', publicWriteLimiter, validate({ body: contactSchema }), contact.submit);
/** Company address, phone, hours - a projection of site settings for the Contact page. */
router.get('/details', contact.details);

router.post(
  '/subscribe',
  publicWriteLimiter,
  optionalAuth,
  validate({ body: newsletterSchema }),
  contact.subscribe
);

/**
 * Both verbs, because the same action arrives two ways: a one-click link in an email
 * footer is a GET with the address in the query string, while the account page POSTs
 * it. The controller reads whichever is present.
 */
router.post(
  '/unsubscribe',
  publicWriteLimiter,
  validate({ body: unsubscribeSchema }),
  contact.unsubscribe
);
router.get(
  '/unsubscribe',
  publicWriteLimiter,
  validate({ query: unsubscribeQuery }),
  contact.unsubscribe
);

// --- Admin -------------------------------------------------------------------

router.use('/admin', requireAuth, requireStaff);

router.get('/admin/messages', validate({ query: contactListQuery }), contact.adminList);
router.get('/admin/subscribers', validate({ query: subscriberListQuery }), contact.adminSubscribers);
/** CSV of the active list, for whichever mail tool the shop actually sends from. */
router.get('/admin/subscribers/export', contact.adminExportSubscribers);

router.get('/admin/messages/:id', validate({ params: idParams }), contact.adminGetById);
router.patch(
  '/admin/messages/:id',
  validate({ params: idParams, body: contactUpdateSchema }),
  contact.adminUpdate
);
router.delete('/admin/messages/:id', validate({ params: idParams }), contact.adminRemove);

export default router;
