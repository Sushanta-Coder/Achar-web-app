import { Router } from 'express';
import * as products from '../controllers/productController.js';
import { optionalAuth, requireAuth, requireStaff } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { readHeavyLimiter } from '../middleware/rateLimiter.js';
import {
  productListQuery,
  createProductSchema,
  updateProductSchema,
  productSlugParams,
  stockUpdateSchema,
  bulkStatusSchema,
  suggestQuery,
} from '../validators/productValidators.js';
import { idParams } from '../validators/common.js';

/**
 * `/api/products`
 *
 * Order matters here: the literal paths (`/search`, `/facets`, `/admin`) are
 * declared before `/:slug`, or Express would match "search" as a product slug.
 *
 * `optionalAuth` on the read routes is what lets a staff member preview an inactive
 * product from the same URL a customer uses, without a second endpoint to keep in sync.
 */
const router = Router();

router.get('/', validate({ query: productListQuery }), products.list);
router.get('/storefront', products.storefront);
router.get('/search', readHeavyLimiter, validate({ query: productListQuery }), products.search);
router.get('/facets', validate({ query: productListQuery }), products.facets);
router.get('/suggestions', readHeavyLimiter, validate({ query: suggestQuery }), products.suggestions);

// --- Admin (declared before `/:slug` so "admin" is never read as a slug) -------

router.get('/admin/list', requireAuth, requireStaff, validate({ query: productListQuery }), products.adminList);
router.post('/admin', requireAuth, requireStaff, validate({ body: createProductSchema }), products.create);
router.post(
  '/admin/bulk-status',
  requireAuth,
  requireStaff,
  validate({ body: bulkStatusSchema }),
  products.bulkStatus
);
router.get('/admin/:id', requireAuth, requireStaff, validate({ params: idParams }), products.adminGetById);
router.patch(
  '/admin/:id',
  requireAuth,
  requireStaff,
  validate({ params: idParams, body: updateProductSchema }),
  products.update
);
router.delete('/admin/:id', requireAuth, requireStaff, validate({ params: idParams }), products.remove);
router.patch(
  '/admin/:id/stock',
  requireAuth,
  requireStaff,
  validate({ params: idParams, body: stockUpdateSchema }),
  products.updateStock
);

router.get('/:slug', optionalAuth, validate({ params: productSlugParams }), products.getBySlug);

export default router;
