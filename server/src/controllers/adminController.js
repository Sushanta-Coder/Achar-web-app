import mongoose from 'mongoose';
import User from '../models/User.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Review from '../models/Review.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated, paginationMeta } from '../utils/ApiResponse.js';
import { parsePagination, escapeRegex } from '../utils/pagination.js';
import { sendCsv, datedFilename } from '../utils/csv.js';
import { formatNepalDate } from '../utils/nepalTime.js';
import {
  getDashboardSummary,
  getFullReport,
  getSalesSeries,
  getBestSellers,
  getSalesByCategory,
  getPaymentMethodBreakdown,
  getSalesByDistrict,
  getTopCustomers,
  getPaymentReliability,
  getOrderExportRows,
  resolveRange,
} from '../services/reportService.js';
import { findLowStock, setVariantStock } from '../services/inventoryService.js';
import { availableGateways } from '../services/payments/PaymentService.js';
import logger from '../config/logger.js';
import { ORDER_STATUS, PAYMENT_STATUS, REVIEW_STATUS, ROLES, STAFF_ROLES } from '../utils/constants.js';

/**
 * Admin-only endpoints that do not belong to a single resource: the dashboard,
 * reports, customer and staff management, and the inventory view.
 *
 * Product, order, payment, coupon, review, blog and banner administration lives in
 * each resource's own controller. What is left here is genuinely cross-cutting.
 *
 * Two rules run through the whole file:
 *   - Staff may *read* customers and adjust stock; only an admin may change roles,
 *     deactivate accounts or touch settings. The route layer enforces which of
 *     `requireStaff` / `requireAdmin` applies, and the handlers assume nothing.
 *   - An admin can never lock themselves or the shop out. `requireAnotherAdmin`
 *     refuses any change that would leave zero active admins, and self-demotion
 *     and self-deactivation are rejected outright.
 */

// --- Dashboard ---------------------------------------------------------------

export const dashboard = asyncHandler(async (req, res) => {
  const range = req.query.range ?? '30d';

  const [summary, sales, bestSellers, gateways, pendingReviews] = await Promise.all([
    getDashboardSummary({ range }),
    getSalesSeries({ range }),
    getBestSellers({ range, limit: 5 }),
    availableGateways(),
    Review.countDocuments({ status: REVIEW_STATUS.PENDING }),
  ]);

  return sendSuccess(res, {
    data: {
      summary,
      sales,
      bestSellers,
      // Things that need a human. Surfaced on the dashboard because an order stuck
      // awaiting payment or a review awaiting moderation is invisible otherwise.
      actionRequired: {
        pendingReviews,
        ...(await countsNeedingAttention()),
      },
      health: {
        gateways,
        // A shop with no working gateway can still take COD, but the admin should know.
        noOnlineGateway: gateways.length === 0,
      },
    },
  });
});

async function countsNeedingAttention() {
  const [awaitingPayment, awaitingDispatch, lowStock] = await Promise.all([
    Order.countDocuments({
      status: ORDER_STATUS.PAYMENT_PENDING,
      paymentStatus: { $ne: PAYMENT_STATUS.PAID },
    }),
    // Paid but not yet handed to a courier - the queue the packing team works from.
    Order.countDocuments({
      status: { $in: [ORDER_STATUS.PAID, ORDER_STATUS.PROCESSING, ORDER_STATUS.PACKED] },
    }),
    findLowStock({ limit: 100 }).then((rows) => rows.length),
  ]);
  return { awaitingPayment, awaitingDispatch, lowStock };
}

// --- Reports -----------------------------------------------------------------

/** Everything the Reports page draws, in one round trip. */
export const reports = asyncHandler(async (req, res) => {
  const range = req.query.range ?? '30d';
  const report = await getFullReport({ range });
  return sendSuccess(res, { data: { ...report, range: resolveRange(range) } });
});

/**
 * A single chart, for when the client only needs to refresh one panel after a
 * range change rather than re-fetching the whole report.
 */
const REPORT_SECTIONS = {
  sales: getSalesSeries,
  bestSellers: getBestSellers,
  categories: getSalesByCategory,
  payments: getPaymentMethodBreakdown,
  districts: getSalesByDistrict,
  // All-time by design - a loyalty list is about lifetime value, so this one
  // ignores the range selector.
  customers: getTopCustomers,
  reliability: getPaymentReliability,
};

export const reportSection = asyncHandler(async (req, res) => {
  const loader = REPORT_SECTIONS[req.params.section];
  if (!loader) {
    throw ApiError.notFound(
      `Unknown report section. Available: ${Object.keys(REPORT_SECTIONS).join(', ')}`
    );
  }

  const data = await loader({ range: req.query.range ?? '30d' });
  return sendSuccess(res, { data: { section: req.params.section, data } });
});

// --- Exports -----------------------------------------------------------------

const ORDER_EXPORT_HEADER = [
  'Order Number',
  'Date',
  'Customer',
  'Phone',
  'District',
  'Province',
  'Items',
  'Subtotal (NPR)',
  'Discount (NPR)',
  'Delivery (NPR)',
  'Total (NPR)',
  'Payment Method',
  'Payment Status',
  'Order Status',
];

export const exportOrders = asyncHandler(async (req, res) => {
  const rows = await getOrderExportRows({
    from: req.query.from,
    to: req.query.to,
    status: req.query.status,
  });

  logger.info(`Order export: ${rows.length} rows by ${req.user.email}`);

  return sendCsv(res, {
    filename: datedFilename('orders'),
    rows: [
      ORDER_EXPORT_HEADER,
      ...rows.map((row) => [
        row.orderNumber,
        row.date,
        row.customer,
        row.phone,
        row.district,
        row.province,
        row.items,
        row.subtotal,
        row.discount,
        row.delivery,
        row.total,
        row.paymentMethod,
        row.paymentStatus,
        row.status,
      ]),
    ],
  });
});

export const exportCustomers = asyncHandler(async (req, res) => {
  const customers = await User.find({ role: ROLES.CUSTOMER })
    .select('name email phone orderCount totalSpent createdAt lastLoginAt marketingOptIn isActive')
    .sort({ totalSpent: -1 })
    .limit(10_000)
    .lean();

  logger.info(`Customer export: ${customers.length} rows by ${req.user.email}`);

  return sendCsv(res, {
    filename: datedFilename('customers'),
    rows: [
      ['Name', 'Email', 'Phone', 'Orders', 'Total Spent (NPR)', 'Joined', 'Last Login', 'Marketing Opt-In', 'Active'],
      ...customers.map((customer) => [
        customer.name,
        customer.email,
        customer.phone ?? '',
        customer.orderCount ?? 0,
        customer.totalSpent ?? 0,
        formatNepalDate(customer.createdAt),
        formatNepalDate(customer.lastLoginAt),
        customer.marketingOptIn ? 'Yes' : 'No',
        customer.isActive ? 'Yes' : 'No',
      ]),
    ],
  });
});

export const exportInventory = asyncHandler(async (_req, res) => {
  // Higher cap than the on-screen list: an export is expected to be complete.
  const rows = await inventoryRows({ limit: 10_000 });

  return sendCsv(res, {
    filename: datedFilename('inventory'),
    rows: [
      ['SKU', 'Product', 'Size', 'Price (NPR)', 'On Hand', 'Reserved', 'Available', 'Low Stock At', 'Status'],
      ...rows.map((row) => [
        row.sku,
        row.name,
        row.size,
        row.price,
        row.stock,
        row.reservedStock,
        row.availableStock,
        row.lowStockThreshold,
        row.stockStatus,
      ]),
    ],
  });
});

// --- Customers ---------------------------------------------------------------

export const listCustomers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20 });

  const filter = { role: ROLES.CUSTOMER };
  if (req.query.q) {
    const pattern = new RegExp(escapeRegex(req.query.q), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }, { phone: pattern }];
  }
  if (req.query.active !== undefined) filter.isActive = req.query.active === 'true';
  // "Customers who have actually bought something" - the list an admin usually wants.
  if (req.query.hasOrders === 'true') filter.orderCount = { $gt: 0 };

  const sort =
    { spent: { totalSpent: -1 }, orders: { orderCount: -1 }, name: { name: 1 } }[req.query.sort] ??
    { createdAt: -1 };

  const [customers, total, stats] = await Promise.all([
    User.find(filter)
      .select('name email phone role isActive orderCount totalSpent createdAt lastLoginAt marketingOptIn')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
    customerStats(),
  ]);

  return sendSuccess(res, {
    data: { customers, stats },
    meta: paginationMeta({ page, limit, total }),
  });
});

async function customerStats() {
  const [row] = await User.aggregate([
    { $match: { role: ROLES.CUSTOMER } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        active: { $sum: { $cond: ['$isActive', 1, 0] } },
        buyers: { $sum: { $cond: [{ $gt: ['$orderCount', 0] }, 1, 0] } },
        revenue: { $sum: '$totalSpent' },
        subscribed: { $sum: { $cond: ['$marketingOptIn', 1, 0] } },
      },
    },
  ]);

  const stats = row ?? { total: 0, active: 0, buyers: 0, revenue: 0, subscribed: 0 };
  return {
    ...stats,
    // Average order value across buyers only; dividing by every registered account
    // would understate it and make the figure useless.
    averageLifetimeValue: stats.buyers ? Math.round(stats.revenue / stats.buyers) : 0,
  };
}

/** One customer with their order history - the admin Customer Details screen. */
export const getCustomer = asyncHandler(async (req, res) => {
  const customer = await User.findById(req.params.id).lean();
  if (!customer) throw ApiError.notFound('Customer not found');

  const [orders, totals] = await Promise.all([
    Order.find({ user: customer._id })
      .select('orderNumber createdAt status paymentStatus paymentMethod pricing.total items')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    // Recomputed rather than read from the denormalised counters, so this screen can
    // be used to spot a counter that has drifted.
    Order.aggregate([
      { $match: { user: customer._id } },
      {
        $group: {
          _id: null,
          orders: { $sum: 1 },
          paid: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', PAYMENT_STATUS.PAID] }, 1, 0] },
          },
          spent: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', PAYMENT_STATUS.PAID] }, '$pricing.total', 0] },
          },
        },
      },
    ]),
  ]);

  const actual = totals[0] ?? { orders: 0, paid: 0, spent: 0 };

  return sendSuccess(res, {
    data: {
      customer,
      orders: orders.map((order) => ({
        ...order,
        itemCount: order.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
        items: undefined,
      })),
      totals: actual,
      countersMatch: actual.orders === (customer.orderCount ?? 0) && actual.spent === (customer.totalSpent ?? 0),
    },
  });
});

/**
 * Deactivation, not deletion. Orders reference the account, and a customer who
 * asks to be erased is handled through `userController.deleteAccount`, which
 * anonymises instead of orphaning order history.
 */
export const setCustomerActive = asyncHandler(async (req, res) => {
  // `tokenVersion` is `select: false`, so it must be asked for explicitly. Without
  // the `+`, the bump below would write 1 over a higher stored value and quietly
  // revalidate every token that version was meant to kill.
  const customer = await User.findById(req.params.id).select('+tokenVersion');
  if (!customer) throw ApiError.notFound('Customer not found');

  if (String(customer._id) === String(req.user._id)) {
    throw ApiError.badRequest('You cannot deactivate your own account');
  }
  if (customer.role === ROLES.ADMIN) {
    await requireAnotherAdmin(customer._id, 'deactivate');
  }

  customer.isActive = Boolean(req.body.isActive);
  // Existing access tokens stay valid until they expire unless we invalidate them,
  // so a deactivation takes effect immediately rather than in fifteen minutes.
  if (!customer.isActive) customer.tokenVersion = (customer.tokenVersion ?? 0) + 1;
  await customer.save();

  logger.info(
    `${customer.isActive ? 'Reactivated' : 'Deactivated'} ${customer.email} by ${req.user.email}`
  );

  return sendSuccess(res, {
    message: customer.isActive ? 'Account reactivated' : 'Account deactivated',
    data: { id: String(customer._id), isActive: customer.isActive },
  });
});

// --- Staff -------------------------------------------------------------------

export const listStaff = asyncHandler(async (_req, res) => {
  const staff = await User.find({ role: { $in: STAFF_ROLES } })
    .select('name email phone role isActive createdAt lastLoginAt')
    .sort({ role: 1, name: 1 })
    .lean();

  return sendSuccess(res, {
    data: {
      staff,
      roles: STAFF_ROLES,
      activeAdmins: staff.filter((member) => member.role === ROLES.ADMIN && member.isActive).length,
    },
  });
});

/**
 * Creates a staff or admin account.
 *
 * The password is set by the admin and hashed by the User model's pre-save hook.
 * There is no invitation email flow here - one fewer moving part, and the admin
 * hands over the credential out of band and the holder changes it on first login.
 */
export const createStaff = asyncHandler(async (req, res) => {
  const { name, email, phone, password, role } = req.body;

  if (!STAFF_ROLES.includes(role)) {
    throw ApiError.badRequest(`Role must be one of: ${STAFF_ROLES.join(', ')}`);
  }
  if (await User.exists({ email: String(email).toLowerCase() })) {
    throw ApiError.conflict('An account with that email already exists');
  }

  const member = await User.create({
    name,
    email,
    phone,
    password,
    role,
    // Created by a trusted admin, so no verification round trip is needed.
    emailVerified: true,
  });

  logger.info(`Staff account created: ${member.email} (${role}) by ${req.user.email}`);

  return sendCreated(res, {
    message: `${member.name} can now sign in to the admin panel`,
    data: { staff: member.toJSON() },
  });
});

export const updateStaff = asyncHandler(async (req, res) => {
  const member = await User.findById(req.params.id).select('+tokenVersion');
  if (!member) throw ApiError.notFound('Staff member not found');

  const isSelf = String(member._id) === String(req.user._id);
  const { name, phone, role, isActive } = req.body;

  if (name !== undefined) member.name = name;
  if (phone !== undefined) member.phone = phone;

  if (role !== undefined && role !== member.role) {
    if (!STAFF_ROLES.includes(role)) {
      throw ApiError.badRequest(`Role must be one of: ${STAFF_ROLES.join(', ')}`);
    }
    // Losing the last admin would leave nobody able to grant the role back.
    if (isSelf) throw ApiError.badRequest('You cannot change your own role');
    if (member.role === ROLES.ADMIN) await requireAnotherAdmin(member._id, 'demote');
    member.role = role;
    member.tokenVersion = (member.tokenVersion ?? 0) + 1;
  }

  if (isActive !== undefined && isActive !== member.isActive) {
    if (isSelf) throw ApiError.badRequest('You cannot deactivate your own account');
    if (!isActive && member.role === ROLES.ADMIN) {
      await requireAnotherAdmin(member._id, 'deactivate');
    }
    member.isActive = Boolean(isActive);
    if (!member.isActive) member.tokenVersion = (member.tokenVersion ?? 0) + 1;
  }

  await member.save();
  logger.info(`Staff account updated: ${member.email} by ${req.user.email}`);

  return sendSuccess(res, { message: 'Staff member updated', data: { staff: member.toJSON() } });
});

/**
 * Resets a staff member's password. Bumps `tokenVersion`, so any session they
 * still have open is signed out - which is the point when the reset is because a
 * credential was shared or leaked.
 */
export const resetStaffPassword = asyncHandler(async (req, res) => {
  const member = await User.findById(req.params.id).select('+tokenVersion');
  if (!member) throw ApiError.notFound('Staff member not found');
  if (!STAFF_ROLES.includes(member.role)) {
    throw ApiError.badRequest('Use the customer screens for customer accounts');
  }

  member.password = req.body.password;
  member.tokenVersion = (member.tokenVersion ?? 0) + 1;
  await member.save();

  logger.warn(`Staff password reset for ${member.email} by ${req.user.email}`);

  return sendSuccess(res, {
    message: `Password reset. ${member.name} has been signed out of all devices.`,
  });
});

/** Downgrades to customer rather than deleting, so audit trails stay intact. */
export const revokeStaff = asyncHandler(async (req, res) => {
  const member = await User.findById(req.params.id).select('+tokenVersion');
  if (!member) throw ApiError.notFound('Staff member not found');

  if (String(member._id) === String(req.user._id)) {
    throw ApiError.badRequest('You cannot revoke your own access');
  }
  if (member.role === ROLES.ADMIN) await requireAnotherAdmin(member._id, 'revoke');

  member.role = ROLES.CUSTOMER;
  member.tokenVersion = (member.tokenVersion ?? 0) + 1;
  await member.save();

  logger.warn(`Admin access revoked for ${member.email} by ${req.user.email}`);

  return sendSuccess(res, {
    message: `${member.name} no longer has admin access`,
    data: { id: String(member._id), role: member.role },
  });
});

/** The lockout guard: there must always be at least one other active admin. */
async function requireAnotherAdmin(excludeId, action) {
  const others = await User.countDocuments({
    _id: { $ne: excludeId },
    role: ROLES.ADMIN,
    isActive: true,
  });
  if (!others) {
    throw ApiError.badRequest(
      `This is the only active admin account, so it cannot be ${action}d. Create another admin first.`
    );
  }
}

// --- Inventory ---------------------------------------------------------------

/**
 * Flat variant-level stock view. Built with an aggregation because the admin needs
 * one row per size, not one per product, and sorting by available stock across
 * every variant cannot be done in application code without loading the catalogue.
 */
async function inventoryRows({ q, status, limit = 500 }) {
  const pipeline = [
    { $unwind: '$variants' },
    {
      $project: {
        _id: 0,
        productId: '$_id',
        name: 1,
        slug: 1,
        thumbnail: 1,
        isActive: 1,
        variantId: '$variants._id',
        sku: '$variants.sku',
        size: '$variants.size',
        price: '$variants.price',
        stock: '$variants.stock',
        reservedStock: '$variants.reservedStock',
        availableStock: '$variants.availableStock',
        lowStockThreshold: { $ifNull: ['$variants.lowStockThreshold', 5] },
        variantActive: '$variants.isActive',
      },
    },
    {
      $addFields: {
        stockStatus: {
          $switch: {
            branches: [
              { case: { $lte: ['$availableStock', 0] }, then: 'out-of-stock' },
              { case: { $lte: ['$availableStock', '$lowStockThreshold'] }, then: 'low-stock' },
            ],
            default: 'in-stock',
          },
        },
      },
    },
    { $sort: { availableStock: 1, name: 1 } },
    { $limit: limit },
  ];

  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    pipeline.unshift({ $match: { $or: [{ name: pattern }, { 'variants.sku': pattern }] } });
  }
  if (status) {
    // After `$addFields`, so it filters on the computed status rather than repeating
    // the threshold comparison.
    pipeline.splice(-2, 0, { $match: { stockStatus: status } });
  }

  return Product.aggregate(pipeline);
}

export const inventory = asyncHandler(async (req, res) => {
  const [rows, lowStock] = await Promise.all([
    inventoryRows({ q: req.query.q, status: req.query.status }),
    findLowStock({ limit: 100 }),
  ]);

  const counts = rows.reduce(
    (acc, row) => ({ ...acc, [row.stockStatus]: (acc[row.stockStatus] ?? 0) + 1 }),
    { 'in-stock': 0, 'low-stock': 0, 'out-of-stock': 0 }
  );

  return sendSuccess(res, {
    data: {
      items: rows,
      counts,
      lowStock,
      // Stock tied up in unpaid orders. Worth seeing on its own: a large number here
      // usually means abandoned checkouts holding inventory hostage.
      reservedUnits: rows.reduce((sum, row) => sum + (row.reservedStock ?? 0), 0),
      stockValue: rows.reduce((sum, row) => sum + row.price * Math.max(0, row.stock), 0),
    },
  });
});

/**
 * Sets on-hand stock for one size. Delegates to `inventoryService`, which refuses
 * to set stock below what live orders have already reserved - so a stocktake can
 * never silently oversell an order that is mid-payment.
 */
export const adjustStock = asyncHandler(async (req, res) => {
  const { productId, variantId } = req.params;
  const { stock } = req.body;

  const product = await setVariantStock({ productId, variantId, stock });
  const variant = product.variants.id(variantId);

  logger.info(`Stock set: ${variant.sku} -> ${variant.stock} by ${req.user.email}`);

  return sendSuccess(res, {
    message: `${product.name} (${variant.size}) stock set to ${variant.stock}`,
    data: {
      sku: variant.sku,
      stock: variant.stock,
      reservedStock: variant.reservedStock,
      availableStock: variant.availableStock,
      totalStock: product.totalStock,
    },
  });
});

/**
 * Bulk stocktake: several sizes in one submit. Rows are applied one at a time and
 * failures reported per row, because rejecting an entire count sheet over a single
 * bad line would make the screen unusable.
 */
export const bulkAdjustStock = asyncHandler(async (req, res) => {
  const updates = req.body.updates ?? [];
  const applied = [];
  const failed = [];

  for (const update of updates) {
    try {
      const product = await setVariantStock(update);
      const variant = product.variants.id(update.variantId);
      applied.push({ sku: variant.sku, stock: variant.stock, availableStock: variant.availableStock });
    } catch (error) {
      failed.push({
        variantId: update.variantId,
        reason: error instanceof ApiError ? error.message : 'Could not update this row',
      });
    }
  }

  logger.info(`Bulk stock update: ${applied.length} applied, ${failed.length} failed by ${req.user.email}`);

  return sendSuccess(res, {
    message: failed.length
      ? `${applied.length} of ${updates.length} rows updated`
      : `${applied.length} row${applied.length === 1 ? '' : 's'} updated`,
    data: { applied, failed },
  });
});

/**
 * Recomputes the denormalised `orderCount` / `totalSpent` on every customer.
 *
 * These are maintained incrementally by the order service, which is right for
 * performance but means an interrupted write can leave them slightly off. This is
 * the repair tool - the equivalent of the review rating recount.
 */
export const recalculateCustomerTotals = asyncHandler(async (req, res) => {
  const rows = await Order.aggregate([
    { $match: { user: { $ne: null }, paymentStatus: PAYMENT_STATUS.PAID } },
    { $group: { _id: '$user', orders: { $sum: 1 }, spent: { $sum: '$pricing.total' } } },
  ]);

  const operations = rows.map((row) => ({
    updateOne: {
      filter: { _id: row._id },
      update: { $set: { orderCount: row.orders, totalSpent: row.spent } },
    },
  }));

  // Customers whose paid orders were all refunded away drop out of the aggregation
  // entirely, so they have to be zeroed explicitly or they keep a stale total.
  const withTotals = rows.map((row) => row._id);
  operations.push({
    updateMany: {
      filter: {
        role: ROLES.CUSTOMER,
        _id: { $nin: withTotals },
        $or: [{ orderCount: { $gt: 0 } }, { totalSpent: { $gt: 0 } }],
      },
      update: { $set: { orderCount: 0, totalSpent: 0 } },
    },
  });

  const result = await User.bulkWrite(operations);
  logger.info(`Customer totals recalculated by ${req.user.email}`);

  return sendSuccess(res, {
    message: 'Customer order totals recalculated',
    data: { customersWithOrders: rows.length, modified: result.modifiedCount ?? 0 },
  });
});

/**
 * Deployment health, for the admin footer. Deliberately coarse: connection state
 * and collection counts, nothing that reveals configuration.
 */
export const health = asyncHandler(async (_req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];

  return sendSuccess(res, {
    data: {
      database: {
        state: states[mongoose.connection.readyState] ?? 'unknown',
        name: mongoose.connection.name,
      },
      uptimeSeconds: Math.round(process.uptime()),
      counts: {
        products: await Product.countDocuments(),
        orders: await Order.countDocuments(),
        customers: await User.countDocuments({ role: ROLES.CUSTOMER }),
      },
    },
  });
});

export default {
  dashboard,
  reports,
  reportSection,
  exportOrders,
  exportCustomers,
  exportInventory,
  listCustomers,
  getCustomer,
  setCustomerActive,
  listStaff,
  createStaff,
  updateStaff,
  resetStaffPassword,
  revokeStaff,
  inventory,
  adjustStock,
  bulkAdjustStock,
  recalculateCustomerTotals,
  health,
};
