import { Router } from 'express';
import * as admin from '../controllers/adminController.js';
import { requireAuth, requireAdmin, requireStaff } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  reportQuery,
  reportSectionParams,
  exportOrdersQuery,
  customerListQuery,
  setCustomerActiveSchema,
  createStaffSchema,
  updateStaffSchema,
  resetStaffPasswordSchema,
  inventoryQuery,
  variantParams,
  adjustStockSchema,
  bulkAdjustStockSchema,
} from '../validators/contentValidators.js';
import { idParams } from '../validators/common.js';

/**
 * `/api/admin`
 *
 * Mounted as one router rather than per-feature files because every route here is
 * an authenticated privileged action and there is no guest traffic to keep clear of.
 * The `requireStaff` default and the `requireAdmin` islands below encode the actual
 * split: staff can run the day-to-day screens, but only a full admin can create or
 * deactivate other admin accounts, manage staff, or run the repair operations that
 * touch every customer.
 */
const router = Router();

router.use(requireAuth, requireStaff);

/**
 * Deployment diagnostics for the admin footer: connection state, uptime, collection
 * counts. Behind the guard with everything else - the unauthenticated liveness probe
 * a load balancer needs is `/api/health`, which deliberately reports nothing beyond
 * "the process is up". The database name and row counts are not load-balancer
 * business.
 */
router.get('/health', admin.health);

// --- Dashboard and reports ----------------------------------------------------

router.get('/dashboard', validate({ query: reportQuery }), admin.dashboard);
router.get('/reports', validate({ query: reportQuery }), admin.reports);
router.get(
  '/reports/:section',
  validate({ params: reportSectionParams, query: reportQuery }),
  admin.reportSection
);

router.get('/export/orders', validate({ query: exportOrdersQuery }), admin.exportOrders);
router.get('/export/customers', admin.exportCustomers);
router.get('/export/inventory', admin.exportInventory);

// --- Customers ----------------------------------------------------------------

router.get('/customers', validate({ query: customerListQuery }), admin.listCustomers);
router.get('/customers/:id', validate({ params: idParams }), admin.getCustomer);
router.patch(
  '/customers/:id/active',
  validate({ params: idParams, body: setCustomerActiveSchema }),
  admin.setCustomerActive
);
/**
 * Repair tool, not routine maintenance. The order service keeps `orderCount` and
 * `totalSpent` current incrementally; this recomputes them from source after a crash
 * mid-write. Admin-only because it rewrites one field on every customer.
 */
router.post('/customers/recount', requireAdmin, admin.recalculateCustomerTotals);

// --- Staff (admin-only) -------------------------------------------------------

router.use('/staff', requireAdmin);

router.get('/staff', admin.listStaff);
router.post('/staff', validate({ body: createStaffSchema }), admin.createStaff);
router.patch(
  '/staff/:id',
  validate({ params: idParams, body: updateStaffSchema }),
  admin.updateStaff
);
/**
 * Guardrail on purpose: changing a colleague's password is its own endpoint, so an
 * ordinary profile PATCH can never rotate credentials as a side effect.
 */
router.patch(
  '/staff/:id/password',
  validate({ params: idParams, body: resetStaffPasswordSchema }),
  admin.resetStaffPassword
);
router.patch('/staff/:id/revoke', validate({ params: idParams }), admin.revokeStaff);

// --- Inventory ----------------------------------------------------------------

router.get('/inventory', validate({ query: inventoryQuery }), admin.inventory);
router.patch(
  '/inventory/:productId/:variantId',
  validate({ params: variantParams, body: adjustStockSchema }),
  admin.adjustStock
);
router.post(
  '/inventory/bulk',
  validate({ body: bulkAdjustStockSchema }),
  admin.bulkAdjustStock
);

export default router;
