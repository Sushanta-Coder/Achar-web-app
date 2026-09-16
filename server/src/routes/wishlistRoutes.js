import { Router } from 'express';
import * as wishlist from '../controllers/wishlistController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { wishlistMergeSchema } from '../validators/orderValidators.js';
import { productIdParams } from '../validators/common.js';

/**
 * `/api/wishlist` - entirely private, so the whole router sits behind `requireAuth`.
 * Guests keep a wishlist in localStorage and hand it over via `/merge` at sign-in.
 *
 * `/merge` is declared before `/:productId`: registered the other way round, Express
 * would match "merge" as a product id and the hand-off would fail validation.
 */
const router = Router();

router.use(requireAuth);

router.get('/', wishlist.get);
/** Ids only - what the product grid needs to draw filled hearts without a second fetch. */
router.get('/ids', wishlist.ids);
router.delete('/', wishlist.clear);
router.post('/merge', validate({ body: wishlistMergeSchema }), wishlist.merge);

router.post('/:productId', validate({ params: productIdParams }), wishlist.add);
router.delete('/:productId', validate({ params: productIdParams }), wishlist.remove);
router.post('/:productId/toggle', validate({ params: productIdParams }), wishlist.toggle);

export default router;
