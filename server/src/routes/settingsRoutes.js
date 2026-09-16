import { Router } from 'express';
import * as settings from '../controllers/settingsController.js';
import { requireAuth, requireAdmin, requireStaff } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  updateSettingsSchema,
  seoSettingsSchema,
  homepageSettingsSchema,
  maintenanceSchema,
  policyParams,
} from '../validators/contentValidators.js';

/**
 * `/api/settings`
 *
 * The public endpoint returns a whitelisted projection of the settings document -
 * never the document itself, which also carries the notification recipients and the
 * low-stock thresholds. `settingsService` owns that projection so there is one place
 * to check before adding a field.
 *
 * Writes are admin-only, not staff-only: these values change the shop's public
 * identity, its tax rates and its payment copy.
 */
const router = Router();

/** Everything the client needs to render the shell: brand, contact, social, flags. */
router.get('/', settings.publicSettings);
/**
 * Enums the forms need (spice levels, order statuses, payment methods). Served from
 * the same constants the API validates against, so a dropdown cannot offer a value
 * the server will then reject.
 */
router.get('/reference', settings.referenceData);
/** Provinces and their districts, for the cascading address selects. */
router.get('/locations', settings.locations);
router.get('/policy/:slug', validate({ params: policyParams }), settings.policy);

// --- Admin -------------------------------------------------------------------

/** Staff may read the settings screens; only an admin may save them. */
router.get('/admin', requireAuth, requireStaff, settings.adminGetSettings);

router.use('/admin', requireAuth, requireAdmin);

router.patch('/admin', validate({ body: updateSettingsSchema }), settings.adminUpdateSettings);
/**
 * SEO and homepage get their own endpoints so those screens can save without
 * resending the whole document. Both schemas are derived from `updateSettingsSchema`
 * rather than restated, so a field added to the master schema cannot go missing here.
 */
router.patch('/admin/seo', validate({ body: seoSettingsSchema }), settings.adminUpdateSeo);
router.patch(
  '/admin/homepage',
  validate({ body: homepageSettingsSchema }),
  settings.adminUpdateHomepage
);
router.patch(
  '/admin/maintenance',
  validate({ body: maintenanceSchema }),
  settings.adminSetMaintenance
);

export default router;
