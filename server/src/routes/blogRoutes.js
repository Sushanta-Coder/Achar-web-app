import { Router } from 'express';
import * as blog from '../controllers/blogController.js';
import { requireAuth, requireStaff } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createBlogPostSchema,
  updateBlogPostSchema,
  blogStatusSchema,
  blogListQuery,
} from '../validators/contentValidators.js';
import { idParams, slugParams } from '../validators/common.js';

/**
 * `/api/blog`
 *
 * The public routes only ever see published posts whose `publishedAt` has passed, so a
 * post scheduled for next week is invisible - including to the sitemap. That filter is
 * rebuilt per request rather than held in a constant, or "published" would mean
 * "published as of server start".
 */
const router = Router();

router.get('/', validate({ query: blogListQuery }), blog.list);
router.get('/latest', blog.latest);
/** Categories and tags with counts, for the sidebar. */
router.get('/taxonomy', blog.taxonomy);

// --- Admin (before `/:slug`, or "admin" is read as a post slug) ---------------

router.use('/admin', requireAuth, requireStaff);

router.get('/admin/list', validate({ query: blogListQuery }), blog.adminList);
router.post('/admin', validate({ body: createBlogPostSchema }), blog.create);
router.get('/admin/:id', validate({ params: idParams }), blog.adminGetById);
router.patch('/admin/:id', validate({ params: idParams, body: updateBlogPostSchema }), blog.update);
router.delete('/admin/:id', validate({ params: idParams }), blog.remove);
router.patch(
  '/admin/:id/status',
  validate({ params: idParams, body: blogStatusSchema }),
  blog.setStatus
);

router.get('/:slug', validate({ params: slugParams }), blog.getBySlug);

export default router;
