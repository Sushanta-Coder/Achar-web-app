import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated, paginationMeta } from '../utils/ApiResponse.js';
import { parsePagination, escapeRegex } from '../utils/pagination.js';
import { orderAccessToken, assertCanViewOrder } from '../utils/orderAccess.js';
import {
  createOrder as createOrderService,
  updateOrderStatus,
  cancelOrderByCustomer,
  trackOrder as trackOrderService,
  latestPayment,
} from '../services/orderService.js';
import { renderInvoiceHtml } from '../services/invoiceService.js';
import { availableGateways } from '../services/payments/PaymentService.js';
import { getSettings } from '../services/settingsService.js';
import { track } from '../services/analyticsService.js';
import {
  ONLINE_PAYMENT_METHODS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TRANSITIONS,
} from '../utils/constants.js';
import logger from '../config/logger.js';

/**
 * Orders.
 *
 * Notice what this controller does *not* do: it never touches a gateway, never
 * computes a price and never writes `status` or `paymentStatus` directly. Money and
 * state machine live in `orderService`; gateways live behind `PaymentService`.
 * That separation is what keeps "mark this paid" impossible to reach from an HTTP
 * request body.
 */

const ORDER_LIST_FIELDS =
  'orderNumber status paymentStatus paymentMethod pricing delivery.estimatedDeliveryDate ' +
  'delivery.trackingNumber items createdAt paidAt deliveredAt cancelledAt customer.name';

const summarise = (order) => ({
  ...order,
  itemCount: (order.items ?? []).reduce((sum, item) => sum + item.quantity, 0),
  thumbnail: order.items?.[0]?.image ?? null,
  itemPreview: (order.items ?? []).slice(0, 3).map((item) => ({
    name: item.name,
    size: item.size,
    quantity: item.quantity,
    image: item.image,
  })),
  items: undefined,
});

/**
 * Checkout.
 *
 * The response tells the client what to do next rather than assuming: COD orders
 * are finished, online orders must be sent to `POST /api/payments/initiate`. The
 * order exists in `payment_pending` either way, so an abandoned payment leaves a
 * record instead of a lost sale.
 */
export const create = asyncHandler(async (req, res) => {
  const { order, quote } = await createOrderService({
    user: req.user,
    body: req.body,
    ip: req.ip,
  });

  // Convenience only, and only after the order is safely written.
  if (req.user && req.body.saveAddress) {
    try {
      await saveAddressToAccount(req.user, req.body.shippingAddress);
    } catch (error) {
      logger.warn(`Could not save address for ${req.user.email}: ${error.message}`);
    }
  }

  track({
    type: 'purchase_completed',
    sessionId: req.body.sessionId,
    user: req.user,
    meta: { orderNumber: order.orderNumber, value: order.pricing.total },
  });

  const requiresPayment = ONLINE_PAYMENT_METHODS.includes(order.paymentMethod);

  return sendCreated(res, {
    message: requiresPayment ? 'Order created - continue to payment' : 'Order placed',
    data: {
      order: {
        id: String(order._id),
        orderNumber: order.orderNumber,
        status: order.status,
        statusLabel: ORDER_STATUS_LABELS[order.status],
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        pricing: order.pricing,
        delivery: order.delivery,
        createdAt: order.createdAt,
      },
      // Lets a guest open the confirmation page and retry payment without an account.
      accessToken: req.user ? undefined : orderAccessToken(order),
      requiresPayment,
      nextStep: requiresPayment ? 'payment' : 'confirmation',
      adjustments: { removed: quote.removed, issues: quote.issues },
    },
  });
});

/** Saves the checkout address to the account, ignoring an exact duplicate. */
async function saveAddressToAccount(user, address) {
  const fresh = await User.findById(user._id);
  const duplicate = fresh.addresses.some(
    (saved) =>
      saved.phone === address.phone &&
      saved.district === address.district &&
      saved.municipality === address.municipality &&
      saved.wardNo === address.wardNo &&
      saved.tole === address.tole
  );
  if (duplicate) return;
  if (fresh.addresses.length >= 10) return;
  fresh.addresses.push({ ...address, isDefault: fresh.addresses.length === 0 });
  await fresh.save();
}

/** Everything the checkout page needs to render before anything is submitted. */
export const checkoutContext = asyncHandler(async (req, res) => {
  const [settings, gateways] = await Promise.all([getSettings(), availableGateways()]);
  return sendSuccess(res, {
    data: {
      gateways,
      allowGuestCheckout: settings.commerce.allowGuestCheckout,
      minOrderAmount: settings.commerce.minOrderAmount ?? 0,
      freeDeliveryThreshold: settings.commerce.freeDeliveryThreshold ?? 0,
      taxLabel: settings.commerce.taxLabel,
      addresses: req.user
        ? (req.user.addresses ?? []).map((address) => address.toObject({ virtuals: true }))
        : [],
      customer: req.user
        ? { name: req.user.name, email: req.user.email, phone: req.user.phone ?? '' }
        : null,
    },
  });
});

export const myOrders = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 10 });
  const filter = { user: req.user._id };
  if (req.query.status) filter.status = req.query.status;

  const [orders, total] = await Promise.all([
    Order.find(filter).select(ORDER_LIST_FIELDS).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    data: { orders: orders.map(summarise) },
    meta: paginationMeta({ page, limit, total }),
  });
});

/**
 * One order, by order number. Readable by its owner, by a guest holding the access
 * token issued at checkout, or by staff - `assertCanViewOrder` is the only rule.
 */
export const getByOrderNumber = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ orderNumber: req.params.orderNumber });
  if (!order) throw ApiError.notFound('Order not found');

  assertCanViewOrder(order, req.user, req.query.token);

  const payment = await latestPayment(order._id);

  return sendSuccess(res, {
    data: {
      order: order.toObject({ virtuals: true }),
      statusLabel: ORDER_STATUS_LABELS[order.status],
      payment: payment
        ? {
            gateway: payment.gateway,
            status: payment.status,
            amount: payment.amount,
            transactionId: payment.transactionId,
            reference: payment.gatewayRef,
            paidAt: payment.verifiedAt,
            failureReason: payment.failureReason,
          }
        : null,
      canRetryPayment:
        ONLINE_PAYMENT_METHODS.includes(order.paymentMethod) &&
        order.paymentStatus !== 'paid' &&
        !['cancelled', 'refunded'].includes(order.status),
    },
  });
});

/** Public order tracking: order number plus the phone or email used at checkout. */
export const trackOrder = asyncHandler(async (req, res) => {
  const order = await trackOrderService(req.body);
  return sendSuccess(res, {
    data: {
      order: order.toObject({ virtuals: true }),
      statusLabel: ORDER_STATUS_LABELS[order.status],
    },
  });
});

export const cancel = asyncHandler(async (req, res) => {
  const order = await cancelOrderByCustomer({
    orderId: req.params.id,
    user: req.user,
    reason: req.body.reason,
  });
  return sendSuccess(res, {
    message: 'Your order has been cancelled',
    data: { order: order.toObject({ virtuals: true }) },
  });
});

/**
 * Printable invoice. Returns HTML rather than a PDF: the browser's own print
 * dialogue produces a correct A4 document, and it avoids shipping a PDF engine
 * to render a table.
 */
export const invoice = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ orderNumber: req.params.orderNumber }).select(
    'orderNumber user createdAt'
  );
  if (!order) throw ApiError.notFound('Order not found');
  assertCanViewOrder(order, req.user, req.query.token);

  const html = await renderInvoiceHtml({
    orderNumber: req.params.orderNumber,
    user: req.user,
    allowStaff: Boolean(req.user?.isStaff?.()),
  });

  res.type('html');
  return res.send(html);
});

// --- Admin -------------------------------------------------------------------

export const adminList = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20 });
  const filter = {};

  if (req.query.status) filter.status = req.query.status;
  if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;
  if (req.query.paymentMethod) filter.paymentMethod = req.query.paymentMethod;

  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) {
      const to = new Date(req.query.to);
      to.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = to;
    }
  }

  if (req.query.q) {
    const pattern = new RegExp(escapeRegex(req.query.q), 'i');
    filter.$or = [
      { orderNumber: pattern },
      { 'customer.name': pattern },
      { 'customer.phone': pattern },
      { 'customer.email': pattern },
    ];
  }

  const sortMap = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    'total-high': { 'pricing.total': -1 },
    'total-low': { 'pricing.total': 1 },
  };

  const [orders, total, totals] = await Promise.all([
    Order.find(filter)
      .select(`${ORDER_LIST_FIELDS} shippingAddress.district isGuest user`)
      .sort(sortMap[req.query.sort ?? 'newest'])
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
    Order.aggregate([{ $match: filter }, { $group: { _id: null, value: { $sum: '$pricing.total' } } }]),
  ]);

  return sendSuccess(res, {
    data: { orders: orders.map(summarise), filteredValue: totals[0]?.value ?? 0 },
    meta: paginationMeta({ page, limit, total }),
  });
});

export const adminGetById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('user', 'name email phone orderCount totalSpent createdAt')
    .lean();
  if (!order) throw ApiError.notFound('Order not found');

  const payments = await Payment.find({ order: order._id })
    .select('gateway status amount transactionId gatewayRef attempt failureReason verifiedAt refundAmount refundedAt createdAt')
    .sort({ createdAt: -1 })
    .lean();

  return sendSuccess(res, {
    data: {
      order,
      payments,
      // Drives the status dropdown, so the UI cannot offer an illegal transition.
      allowedTransitions: ORDER_STATUS_TRANSITIONS[order.status] ?? [],
      statusLabel: ORDER_STATUS_LABELS[order.status],
    },
  });
});

export const adminUpdateStatus = asyncHandler(async (req, res) => {
  const order = await updateOrderStatus({
    orderId: req.params.id,
    status: req.body.status,
    actor: req.user,
    note: req.body.note,
    tracking: { trackingNumber: req.body.trackingNumber, courier: req.body.courier },
  });

  return sendSuccess(res, {
    message: `Order marked as ${ORDER_STATUS_LABELS[order.status]}`,
    data: { order: order.toObject({ virtuals: true }) },
  });
});

export const adminUpdateNote = asyncHandler(async (req, res) => {
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    { $set: { adminNote: req.body.adminNote } },
    { new: true, runValidators: true }
  );
  if (!order) throw ApiError.notFound('Order not found');
  return sendSuccess(res, { message: 'Note saved', data: { adminNote: order.adminNote } });
});

/** Counts for the admin order tabs, so each tab does not need its own request. */
export const adminStatusCounts = asyncHandler(async (_req, res) => {
  const rows = await Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  const counts = Object.fromEntries(Object.keys(ORDER_STATUS_LABELS).map((key) => [key, 0]));
  rows.forEach((row) => { counts[row._id] = row.count; });
  counts.all = rows.reduce((sum, row) => sum + row.count, 0);
  return sendSuccess(res, { data: { counts } });
});

export default {
  create,
  checkoutContext,
  myOrders,
  getByOrderNumber,
  trackOrder,
  cancel,
  invoice,
  adminList,
  adminGetById,
  adminUpdateStatus,
  adminUpdateNote,
  adminStatusCounts,
};
