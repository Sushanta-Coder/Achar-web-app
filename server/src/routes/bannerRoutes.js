import { Router } from 'express';
import * as banners from '../controllers/bannerController.js';
import { requireAuth, requireStaff } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createBannerSchema,
  updateBannerSchema,
  bannerReorderSchema,
  bannerListQuery,
} from '../validators/contentValidators.js';
import { idParams } from '../validators/common.js';

/**
 * `/api/banners`
 *
 * The public list is "live" rather than "all": a banner outside its scheduled window
 * is filtered out per request. Scheduling in the query means a campaign can be loaded
 * days ahead and still appear exactly when it should, with nothing to remember to
 * switch on.
 */
const router = Router();

router.get('/', validate({ query: bannerListQuery }), banners.listLive);

// --- Admin -------------------------------------------------------------------

router.use('/admin', requireAuth, requireStaff);

router.get('/admin/list', validate({ query: bannerListQuery }), banners.adminList);
router.post('/admin', validate({ body: createBannerSchema }), banners.create);
/**
 * Reorder is declared before `/admin/:id`, or "reorder" is read as a banner id.
 * It takes the full ordered list of ids for one position rather than a single
 * moved-to index: sending the whole order is idempotent, so a dropped response
 * during a drag does not leave the carousel half-sorted.
 */
router.patch('/admin/reorder', validate({ body: bannerReorderSchema }), banners.reorder);

router.get('/admin/:id', validate({ params: idParams }), banners.adminGetById);
router.patch(
  '/admin/:id',
  validate({ params: idParams, body: updateBannerSchema }),
  banners.update
);
router.patch('/admin/:id/toggle', validate({ params: idParams }), banners.toggle);
router.delete('/admin/:id', validate({ params: idParams }), banners.remove);

export default router;
