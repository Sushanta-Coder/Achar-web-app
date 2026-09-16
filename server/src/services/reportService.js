import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import Review from '../models/Review.js';
import Payment from '../models/Payment.js';
import { findLowStock } from './inventoryService.js';
import {
  NEPAL_TZ,
  nepalDaysAgo,
  startOfNepalMonth,
  addNepalMonths,
  nepalDateKey,
  nepalWeekKey,
  nepalMonthKey,
  formatNepalDate,
} from '../utils/nepalTime.js';
import {
  ORDER_STATUS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS,
  REVIEW_STATUS,
  ROLES,
} from '../utils/constants.js';

/**
 * Reporting and analytics aggregations for the admin dashboard.
 *
 * Everything here is read-only and computed with a single aggregation per figure, so
 * the dashboard stays fast as the order collection grows. The client receives plain
 * numbers and arrays and draws its own lightweight SVG charts - no charting library
 * ships to the browser.
 *
 * "Revenue" means money we actually expect to keep: paid orders that were not
 * cancelled or refunded. Order *counts* include everything, because an abandoned
 * checkout is still useful to see.
 */

const REVENUE_MATCH = {
  paymentStatus: PAYMENT_STATUS.PAID,
  status: { $nin: [ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED] },
};

/**
 * Every window and every chart bucket is expressed in Nepal Time, not the server's
 * timezone - see `utils/nepalTime.js`. A UTC host would otherwise report the shop's
 * morning orders against the previous day.
 */
export function resolveRange(range = '30d') {
  const now = new Date();
  switch (range) {
    case '7d':
      return { from: nepalDaysAgo(6, now), to: now, unit: 'day', label: 'Last 7 days' };
    case '90d':
      return { from: nepalDaysAgo(89, now), to: now, unit: 'week', label: 'Last 90 days' };
    case '12m':
      return { from: addNepalMonths(-11, now), to: now, unit: 'month', label: 'Last 12 months' };
    case 'mtd':
      return { from: startOfNepalMonth(now), to: now, unit: 'day', label: 'This month' };
    case '30d':
    default:
      return { from: nepalDaysAgo(29, now), to: now, unit: 'day', label: 'Last 30 days' };
  }
}

const UNIT_FORMAT = { day: '%Y-%m-%d', week: '%G-W%V', month: '%Y-%m' };

/** Headline cards, each with the previous equivalent period for a trend arrow. */
export async function getDashboardSummary({ range = '30d' } = {}) {
  const { from, to, label } = resolveRange(range);
  const windowMs = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - windowMs);

  const [current, previous, counts, statusBreakdown, lowStock] = await Promise.all([
    periodTotals(from, to),
    periodTotals(prevFrom, from),
    collectionCounts(),
    getOrderStatusBreakdown(),
    findLowStock({ limit: 5 }),
  ]);

  return {
    range: { from, to, label },
    revenue: withTrend(current.revenue, previous.revenue),
    orders: withTrend(current.orders, previous.orders),
    averageOrderValue: withTrend(current.averageOrderValue, previous.averageOrderValue),
    itemsSold: withTrend(current.itemsSold, previous.itemsSold),
    lifetime: counts,
    orderStatus: statusBreakdown,
    lowStock,
  };
}

async function periodTotals(from, to) {
  const [revenueRow] = await Order.aggregate([
    { $match: { ...REVENUE_MATCH, createdAt: { $gte: from, $lt: to } } },
    {
      $group: {
        _id: null,
        revenue: { $sum: '$pricing.total' },
        orders: { $sum: 1 },
        itemsSold: { $sum: { $sum: '$items.quantity' } },
      },
    },
  ]);

  const revenue = revenueRow?.revenue ?? 0;
  const orders = revenueRow?.orders ?? 0;
  return {
    revenue,
    orders,
    itemsSold: revenueRow?.itemsSold ?? 0,
    averageOrderValue: orders ? Math.round(revenue / orders) : 0,
  };
}

function withTrend(value, previous) {
  const change = previous ? Math.round(((value - previous) / previous) * 1000) / 10 : null;
  return { value, previous, changePercent: change };
}

async function collectionCounts() {
  const [orders, pendingOrders, products, activeProducts, customers, pendingReviews, revenueRow] =
    await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({
        status: { $in: [ORDER_STATUS.PENDING, ORDER_STATUS.PAYMENT_PENDING, ORDER_STATUS.PAID] },
      }),
      Product.countDocuments(),
      Product.countDocuments({ isActive: true }),
      User.countDocuments({ role: ROLES.CUSTOMER }),
      Review.countDocuments({ status: REVIEW_STATUS.PENDING }),
      Order.aggregate([{ $match: REVENUE_MATCH }, { $group: { _id: null, total: { $sum: '$pricing.total' } } }]),
    ]);

  return {
    orders,
    pendingOrders,
    products,
    activeProducts,
    customers,
    pendingReviews,
    revenue: revenueRow[0]?.total ?? 0,
  };
}

/**
 * Sales and orders over time, gap-filled so the chart has no missing buckets -
 * a day with no sales should draw a zero, not a hole.
 */
export async function getSalesSeries({ range = '30d' } = {}) {
  const { from, to, unit } = resolveRange(range);

  const rows = await Order.aggregate([
    { $match: { ...REVENUE_MATCH, createdAt: { $gte: from, $lte: to } } },
    {
      $group: {
        // Bucketed in Nepal Time so the labels match `bucketKeys` below. Without the
        // timezone, Mongo groups by UTC day and a whole bucket of real revenue lands
        // on a key the axis never draws - the chart quietly shows zero.
        _id: {
          $dateToString: { format: UNIT_FORMAT[unit], date: '$createdAt', timezone: NEPAL_TZ },
        },
        revenue: { $sum: '$pricing.total' },
        orders: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const byKey = new Map(rows.map((row) => [row._id, row]));
  return {
    unit,
    points: bucketKeys(from, to, unit).map((key) => ({
      key,
      revenue: byKey.get(key)?.revenue ?? 0,
      orders: byKey.get(key)?.orders ?? 0,
    })),
  };
}

/**
 * Every bucket label between two instants, in Nepal Time, so a quiet day draws a
 * zero instead of leaving a hole. Walks in 24h steps from `from` and de-duplicates,
 * which is safe because Nepal has no daylight saving.
 */
function bucketKeys(from, to, unit) {
  const keyOf = { day: nepalDateKey, week: nepalWeekKey, month: nepalMonthKey }[unit] ?? nepalDateKey;

  const keys = [];
  for (
    let cursor = new Date(from);
    cursor <= to;
    cursor = new Date(cursor.getTime() + 86_400_000)
  ) {
    keys.push(keyOf(cursor));
  }

  // The final partial bucket: `to` is "now", which the loop may step past.
  keys.push(keyOf(to));
  return [...new Set(keys)];
}

/** Best sellers by units shipped, from the immutable order line snapshots. */
export async function getBestSellers({ range = '30d', limit = 10 } = {}) {
  const { from, to } = resolveRange(range);

  return Order.aggregate([
    { $match: { ...REVENUE_MATCH, createdAt: { $gte: from, $lte: to } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        name: { $first: '$items.name' },
        slug: { $first: '$items.slug' },
        image: { $first: '$items.image' },
        unitsSold: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.lineTotal' },
        orders: { $addToSet: '$_id' },
      },
    },
    { $addFields: { orderCount: { $size: '$orders' } } },
    { $project: { orders: 0 } },
    { $sort: { unitsSold: -1, revenue: -1 } },
    { $limit: limit },
  ]);
}

/** Revenue split by category, joined through the current product documents. */
export async function getSalesByCategory({ range = '30d' } = {}) {
  const { from, to } = resolveRange(range);

  return Order.aggregate([
    { $match: { ...REVENUE_MATCH, createdAt: { $gte: from, $lte: to } } },
    { $unwind: '$items' },
    {
      $lookup: {
        from: 'products',
        localField: 'items.product',
        foreignField: '_id',
        as: 'product',
        pipeline: [{ $project: { category: 1 } }],
      },
    },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$product.category',
        revenue: { $sum: '$items.lineTotal' },
        unitsSold: { $sum: '$items.quantity' },
      },
    },
    {
      $lookup: {
        from: 'categories',
        localField: '_id',
        foreignField: '_id',
        as: 'category',
        pipeline: [{ $project: { name: 1, slug: 1 } }],
      },
    },
    { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        name: { $ifNull: ['$category.name', 'Uncategorised'] },
        slug: '$category.slug',
        revenue: 1,
        unitsSold: 1,
      },
    },
    { $sort: { revenue: -1 } },
  ]);
}

/** Which gateways customers actually use - drives the pie chart on Reports. */
export async function getPaymentMethodBreakdown({ range = '30d' } = {}) {
  const { from, to } = resolveRange(range);

  const rows = await Order.aggregate([
    { $match: { ...REVENUE_MATCH, createdAt: { $gte: from, $lte: to } } },
    { $group: { _id: '$paymentMethod', orders: { $sum: 1 }, revenue: { $sum: '$pricing.total' } } },
    { $sort: { revenue: -1 } },
  ]);

  const total = rows.reduce((sum, row) => sum + row.orders, 0);
  return rows.map((row) => ({
    method: row._id,
    label: PAYMENT_METHOD_LABELS[row._id] ?? row._id,
    orders: row.orders,
    revenue: row.revenue,
    share: total ? Math.round((row.orders / total) * 1000) / 10 : 0,
  }));
}

export async function getOrderStatusBreakdown() {
  const rows = await Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((row) => [row._id, row.count]));
}

/** Delivery demand by district, which is what actually drives courier planning. */
export async function getSalesByDistrict({ range = '30d', limit = 15 } = {}) {
  const { from, to } = resolveRange(range);

  return Order.aggregate([
    { $match: { ...REVENUE_MATCH, createdAt: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: { district: '$shippingAddress.district', province: '$shippingAddress.province' },
        orders: { $sum: 1 },
        revenue: { $sum: '$pricing.total' },
      },
    },
    {
      $project: {
        _id: 0,
        district: '$_id.district',
        province: '$_id.province',
        orders: 1,
        revenue: 1,
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: limit },
  ]);
}

/** Highest-value customers, for the loyalty and outreach lists. */
export async function getTopCustomers({ limit = 10 } = {}) {
  return Order.aggregate([
    { $match: REVENUE_MATCH },
    {
      $group: {
        _id: { $ifNull: ['$user', '$customer.email'] },
        name: { $first: '$customer.name' },
        email: { $first: '$customer.email' },
        phone: { $first: '$customer.phone' },
        orders: { $sum: 1 },
        spent: { $sum: '$pricing.total' },
        lastOrderAt: { $max: '$createdAt' },
      },
    },
    { $sort: { spent: -1 } },
    { $limit: limit },
    { $addFields: { userId: { $cond: [{ $eq: [{ $type: '$_id' }, 'objectId'] }, '$_id', null] } } },
  ]);
}

/**
 * Gateway health: how many attempts succeed, so a misconfigured key shows up as a
 * failure rate rather than as silent lost revenue.
 */
export async function getPaymentReliability({ range = '30d' } = {}) {
  const { from, to } = resolveRange(range);

  const rows = await Payment.aggregate([
    { $match: { createdAt: { $gte: from, $lte: to } } },
    { $group: { _id: { gateway: '$gateway', status: '$status' }, count: { $sum: 1 } } },
  ]);

  const byGateway = new Map();
  for (const row of rows) {
    const entry = byGateway.get(row._id.gateway) ?? {
      gateway: row._id.gateway,
      label: PAYMENT_METHOD_LABELS[row._id.gateway] ?? row._id.gateway,
      attempts: 0,
      paid: 0,
      failed: 0,
      pending: 0,
      refunded: 0,
    };
    entry.attempts += row.count;
    entry[row._id.status] = (entry[row._id.status] ?? 0) + row.count;
    byGateway.set(row._id.gateway, entry);
  }

  return [...byGateway.values()].map((entry) => ({
    ...entry,
    successRate: entry.attempts ? Math.round((entry.paid / entry.attempts) * 1000) / 10 : 0,
  }));
}

/** Everything the Reports page needs, in one round trip. */
export async function getFullReport({ range = '30d' } = {}) {
  const [summary, sales, bestSellers, categories, payments, districts, customers, reliability] =
    await Promise.all([
      getDashboardSummary({ range }),
      getSalesSeries({ range }),
      getBestSellers({ range }),
      getSalesByCategory({ range }),
      getPaymentMethodBreakdown({ range }),
      getSalesByDistrict({ range }),
      getTopCustomers(),
      getPaymentReliability({ range }),
    ]);

  return {
    summary,
    sales,
    bestSellers,
    categories,
    payments,
    districts,
    customers,
    reliability,
  };
}

/** Flat rows for the CSV export on the Reports page. */
export async function getOrderExportRows({ from, to, status } = {}) {
  const match = {};
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to) match.createdAt.$lte = new Date(to);
  }
  if (status) match.status = status;

  const orders = await Order.find(match)
    .select(
      'orderNumber createdAt status paymentMethod paymentStatus customer shippingAddress pricing items'
    )
    .sort({ createdAt: -1 })
    .limit(5000)
    .lean();

  return orders.map((order) => ({
    orderNumber: order.orderNumber,
    // Nepal-time date, so an export row never disagrees with the dashboard that
    // produced the figure the admin is reconciling against.
    date: formatNepalDate(order.createdAt),
    customer: order.customer.name,
    phone: order.customer.phone,
    district: order.shippingAddress?.district ?? '',
    province: order.shippingAddress?.province ?? '',
    items: order.items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: order.pricing.subtotal,
    discount: order.pricing.itemDiscount + order.pricing.couponDiscount,
    delivery: order.pricing.deliveryCharge,
    total: order.pricing.total,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    status: order.status,
  }));
}

/** Guards `getTopCustomers` grouping keys that are emails rather than ObjectIds. */
export const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

export default {
  resolveRange,
  getDashboardSummary,
  getSalesSeries,
  getBestSellers,
  getSalesByCategory,
  getPaymentMethodBreakdown,
  getOrderStatusBreakdown,
  getSalesByDistrict,
  getTopCustomers,
  getPaymentReliability,
  getFullReport,
  getOrderExportRows,
};
