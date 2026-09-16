import { Router } from 'express';

import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import productRoutes from './productRoutes.js';
import categoryRoutes from './categoryRoutes.js';
import cartRoutes from './cartRoutes.js';
import orderRoutes from './orderRoutes.js';
import paymentRoutes from './paymentRoutes.js';
import reviewRoutes from './reviewRoutes.js';
import wishlistRoutes from './wishlistRoutes.js';
import couponRoutes from './couponRoutes.js';
import blogRoutes from './blogRoutes.js';
import bannerRoutes from './bannerRoutes.js';
import deliveryRoutes from './deliveryRoutes.js';
import settingsRoutes from './settingsRoutes.js';
import contactRoutes from './contactRoutes.js';
import uploadRoutes from './uploadRoutes.js';
import analyticsRoutes from './analyticsRoutes.js';
import seoRoutes from './seoRoutes.js';
import adminRoutes from './adminRoutes.js';

/**
 * The API surface, mounted at `/api` by `app.js`.
 *
 * Every module is a self-contained router that declares its own auth guards, rate
 * limiters and validation. Nothing is applied here that a module could apply itself:
 * a reader wanting to know whether an endpoint is public should be able to answer it
 * from that endpoint's own file, without also holding this one in their head.
 */
const router = Router();

/**
 * Liveness, for the load balancer. Above everything else and free of database work,
 * so it still answers while Mongo is reconnecting - a health check that fails
 * whenever the database blips would have the balancer pull a node that is about to
 * recover on its own. `/api/admin/health` is the detailed, authenticated version.
 */
router.get('/health', (_req, res) =>
  res.json({ success: true, status: 'ok', uptimeSeconds: Math.round(process.uptime()) })
);

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/products', productRoutes);
router.use('/categories', categoryRoutes);
router.use('/cart', cartRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);
router.use('/reviews', reviewRoutes);
router.use('/wishlist', wishlistRoutes);
router.use('/coupons', couponRoutes);
router.use('/blog', blogRoutes);
router.use('/banners', bannerRoutes);
router.use('/delivery', deliveryRoutes);
router.use('/settings', settingsRoutes);
router.use('/contact', contactRoutes);
router.use('/uploads', uploadRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/seo', seoRoutes);
router.use('/admin', adminRoutes);

export default router;
