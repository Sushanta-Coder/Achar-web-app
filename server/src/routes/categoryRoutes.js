import { Router } from 'express';
import * as products from '../controllers/productController.js';
import { optionalAuth, requireAuth, requireStaff } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createCategorySchema,
  updateCategorySchema,
  categoryListQuery,
} from '../validators/productValidators.js';
import { idParams, slugParams } from '../validators/common.js';

/**
 * `/api/categories`
 *
 * Category writes are staff-only and cheap, so they live alongside the reads rather
 * than in the admin router - the shape of the resource is the same either way.
 */
const router = Router();

router.get('/', optionalAuth, validate({ query: categoryListQuery }), products.listCategories);

router.post('/', requireAuth, requireStaff, validate({ body: createCategorySchema }), products.createCategory);
router.post('/recount', requireAuth, requireStaff, products.recountCategories);

router.patch(
  '/:id',
  requireAuth,
  requireStaff,
  validate({ params: idParams, body: updateCategorySchema }),
  products.updateCategory
);
router.delete('/:id', requireAuth, requireStaff, validate({ params: idParams }), products.deleteCategory);

// Last, so `/recount` is never mistaken for a category slug.
router.get('/:slug', optionalAuth, validate({ params: slugParams }), products.getCategoryBySlug);

export default router;
