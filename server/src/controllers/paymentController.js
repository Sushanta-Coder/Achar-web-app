import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, paginationMeta } from '../utils/ApiResponse.js';
import { parsePagination, escapeRegex } from '../utils/pagination.js';
import { assertCanViewOrder } from '../utils/orderAccess.js';
import {
  initiatePayment,
  handleCallback,
  reconcilePayment,
  recordManualRefund,
  availableGateways,
  clientRedirect,
  getProvider,
} from '../services/payments/PaymentService.js';
import { getSettings } from '../services/settingsService.js';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, PAYMENT_STATUS } from '../utils/constants.js';
import env from '../config/env.js';
import logger from '../config/logger.js';

/**
 * Payments.
 *
 * This controller is deliberately thin. It resolves which order is being paid,
 * checks the caller may act on it, and hands everything else to `PaymentService`.
 * No gateway name appears in a conditional here, no signature is checked here, and
 * no order is marked paid here.
 *
 * The gateway `return_url` points at *this* backend, not the frontend. The browser
 * lands on `/api/payments/:gateway/callback`, the server verifies the payment with
 * the gateway directly, and only then is the browser redirected to the client. That
 * is what makes "never trust a frontend redirect" structurally true rather than a
 * convention someone has to remember.
 */

/** Resolves `{orderId|orderNumber}` into an order the caller is allowed to pay. */
async function resolvePayableOrder(req) {
  const { orderId, orderNumber } = req.body;

  const order = orderId
    ? await Order.findById(orderId)
    : await Order.findOne({ orderNumber });

  if (!order) throw ApiError.notFound('Order not found');

  // A guest proves ownership with the token issued at checkout; a signed-in
  // customer must own the order outright.
  const token = req.body.token ?? req.query.token;
  assertCanViewOrder(order, req.user, token);

  return order;
}

/** Payment methods the storefront may offer right now. */
export const methods = asyncHandler(async (_req, res) => {
  const [settings, online] = await Promise.all([getSettings(), availableGateways()]);

  const list = online.map((gateway) => ({
    method: gateway,
    label: settings.payments?.[gateway]?.label || PAYMENT_METHOD_LABELS[gateway],
    kind: 'online',
  }));

  if (settings.payments?.cod?.isEnabled) {
    list.push({
      method: PAYMENT_METHODS.COD,
      label: settings.payments.cod.label || PAYMENT_METHOD_LABELS[PAYMENT_METHODS.COD],
      kind: 'offline',
      maxOrderAmount: settings.payments.cod.maxOrderAmount ?? 0,
    });
  }

  return sendSuccess(res, { data: { methods: list, khaltiPublicKey: env.khalti.publicKey || null } });
});

/**
 * Starts or retries a payment.
 *
 * Khalti returns a URL to redirect to. eSewa needs a browser form POST, so the
 * response carries the target URL and the exact fields - including the signature,
 * which was computed server-side and cannot be altered without invalidating it.
 */
export const initiate = asyncHandler(async (req, res) => {
  const order = await resolvePayableOrder(req);

  const result = await initiatePayment({
    orderId: order._id,
    gateway: req.body.gateway,
    user: req.user,
  });

  return sendSuccess(res, { message: 'Payment initiated', data: result });
});

/**
 * Gateway return handler, for both Khalti and eSewa.
 *
 * Always ends in a 302 to the client: the customer's browser is here, so an error
 * envelope would leave them staring at raw JSON. The failure reason is passed as a
 * query parameter for the client to render, and every abnormal case is logged.
 */
function callbackHandler(gateway) {
  return async (req, res) => {
    // Khalti returns query parameters; eSewa returns a base64 `data` parameter. Some
    // sandbox configurations POST instead of redirecting, so both are accepted.
    const callbackData = { ...req.query, ...(req.body ?? {}) };

    try {
      const result = await handleCallback({ gateway, callbackData });

      if (result.requiresRefund) {
        logger.error(
          `Manual refund required for ${result.order.orderNumber}: a second payment succeeded on an order that was already paid`
        );
      }

      return res.redirect(
        302,
        clientRedirect({
          order: result.order,
          status: result.status,
          reason: result.status === 'paid' ? undefined : result.payment?.failureReason,
        })
      );
    } catch (error) {
      const code = error?.code ?? error?.details?.code ?? 'VERIFICATION_FAILED';
      logger.error(`${gateway} callback failed (${code}): ${error.message}`);

      // Try to name the order so the client can show something useful. If even that
      // is unknown, fall back to a generic failure page.
      const orderNumber = await orderNumberFromCallback(gateway, callbackData);
      if (!orderNumber) {
        return res.redirect(
          302,
          `${env.clientUrl}/payment-failed?status=failed&reason=${encodeURIComponent(error.message)}`
        );
      }

      return res.redirect(
        302,
        clientRedirect({ order: { orderNumber }, status: 'failed', reason: error.message })
      );
    }
  };
}

/**
 * Best-effort order lookup from a callback that failed verification. Uses only the
 * reference shape, never the gateway's claimed status, so it cannot be used to
 * influence anything - it exists purely to render a better error page.
 */
async function orderNumberFromCallback(gateway, callbackData) {
  try {
    const reference = getProvider(gateway).extractRef(callbackData);
    if (!reference) return null;
    const payment = await Payment.findOne({ gateway, gatewayRef: reference }).select('orderNumber');
    return payment?.orderNumber ?? null;
  } catch {
    return null;
  }
}

export const khaltiCallback = asyncHandler(callbackHandler(PAYMENT_METHODS.KHALTI));
export const esewaCallback = asyncHandler(callbackHandler(PAYMENT_METHODS.ESEWA));

/**
 * Status poll for the client. Reads our own records only - it never asks a gateway
 * and never changes anything, so the confirmation page can poll it freely.
 */
export const status = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ orderNumber: req.params.orderNumber }).select(
    'orderNumber user status paymentStatus paymentMethod pricing.total createdAt'
  );
  if (!order) throw ApiError.notFound('Order not found');
  assertCanViewOrder(order, req.user, req.query.token);

  const payment = await Payment.findOne({ order: order._id })
    .select('gateway status amount transactionId verifiedAt failureReason')
    .sort({ createdAt: -1 })
    .lean();

  return sendSuccess(res, {
    data: {
      orderNumber: order.orderNumber,
      orderStatus: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      amount: order.pricing.total,
      payment,
    },
  });
});

// --- Admin -------------------------------------------------------------------

export const adminList = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20 });
  const filter = {};

  if (req.query.gateway) filter.gateway = req.query.gateway;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.q) {
    const pattern = new RegExp(escapeRegex(req.query.q), 'i');
    filter.$or = [{ orderNumber: pattern }, { gatewayRef: pattern }, { transactionId: pattern }];
  }
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) {
      const to = new Date(req.query.to);
      to.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = to;
    }
  }

  const [payments, total, totals] = await Promise.all([
    Payment.find(filter)
      .select('order orderNumber gateway amount status transactionId gatewayRef attempt failureReason verifiedAt refundAmount refundedAt createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Payment.countDocuments(filter),
    Payment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          value: { $sum: '$amount' },
        },
      },
    ]),
  ]);

  return sendSuccess(res, {
    data: {
      payments,
      summary: totals.reduce(
        (acc, row) => ({ ...acc, [row._id]: { count: row.count, value: row.value } }),
        {}
      ),
    },
    meta: paginationMeta({ page, limit, total }),
  });
});

export const adminGetById = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id).lean();
  if (!payment) throw ApiError.notFound('Payment not found');

  const order = await Order.findById(payment.order)
    .select('orderNumber status paymentStatus pricing customer shippingAddress createdAt')
    .lean();

  return sendSuccess(res, { data: { payment, order } });
});

/**
 * "Check with the gateway again" - runs the identical verification path a browser
 * callback would, for a payment left pending because the customer closed the tab.
 */
export const adminReconcile = asyncHandler(async (req, res) => {
  const result = await reconcilePayment({ paymentId: req.params.id });
  return sendSuccess(res, {
    message: `Gateway reports this payment as ${result.status}`,
    data: {
      status: result.status,
      alreadyProcessed: result.alreadyProcessed,
      requiresRefund: Boolean(result.requiresRefund),
      order: {
        orderNumber: result.order.orderNumber,
        status: result.order.status,
        paymentStatus: result.order.paymentStatus,
      },
    },
  });
});

/**
 * Records a refund issued through the gateway's merchant dashboard. Khalti and
 * eSewa refund out-of-band for standard merchant accounts, so this reconciles our
 * books rather than pretending to call an API that is not available to us.
 */
export const adminRecordRefund = asyncHandler(async (req, res) => {
  const payment = await recordManualRefund({
    paymentId: req.params.id,
    amount: req.body.amount,
    reference: req.body.reference,
    actor: req.user,
  });

  // Reflect the refund on the order, without moving it through the status machine:
  // whether the order is also cancelled is a separate, explicit admin decision.
  await Order.updateOne(
    { _id: payment.order },
    {
      $set: {
        paymentStatus: PAYMENT_STATUS.REFUNDED,
        refundedAt: payment.refundedAt,
        refundAmount: payment.refundAmount,
      },
    }
  );

  return sendSuccess(res, {
    message: `Refund of Rs. ${payment.refundAmount} recorded`,
    data: { payment },
  });
});

/** Payments that need a human: pending too long, or a double charge to refund. */
export const adminAttentionList = asyncHandler(async (_req, res) => {
  const staleBefore = new Date(Date.now() - 30 * 60 * 1000);

  const [stalePending, duplicates] = await Promise.all([
    Payment.find({ status: PAYMENT_STATUS.PENDING, createdAt: { $lt: staleBefore } })
      .select('orderNumber gateway amount gatewayRef createdAt')
      .sort({ createdAt: 1 })
      .limit(50)
      .lean(),
    Payment.aggregate([
      { $match: { status: PAYMENT_STATUS.PAID } },
      { $group: { _id: '$order', count: { $sum: 1 }, paid: { $sum: '$amount' }, orderNumber: { $first: '$orderNumber' } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 50 },
    ]),
  ]);

  return sendSuccess(res, {
    data: {
      stalePending,
      doubleCharges: duplicates.map((row) => ({
        orderId: row._id instanceof mongoose.Types.ObjectId ? String(row._id) : row._id,
        orderNumber: row.orderNumber,
        successfulPayments: row.count,
        totalCollected: row.paid,
      })),
    },
  });
});

export default {
  methods,
  initiate,
  khaltiCallback,
  esewaCallback,
  status,
  adminList,
  adminGetById,
  adminReconcile,
  adminRecordRefund,
  adminAttentionList,
};
