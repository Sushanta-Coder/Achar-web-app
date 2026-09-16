import Order from '../../models/Order.js';
import Payment from '../../models/Payment.js';
import ApiError from '../../utils/ApiError.js';
import env from '../../config/env.js';
import logger from '../../config/logger.js';
import { paymentReference } from '../orderNumberService.js';
import { confirmOrderPayment, markPaymentFailed } from '../orderService.js';
import { getSettings } from '../settingsService.js';
import {
  ONLINE_PAYMENT_METHODS,
  ORDER_STATUS,
  PAYMENT_METHODS,
  PAYMENT_STATUS,
} from '../../utils/constants.js';
import KhaltiProvider from './providers/KhaltiProvider.js';
import EsewaProvider from './providers/EsewaProvider.js';
import CodProvider from './providers/CodProvider.js';

/**
 * The one place that knows how a payment is started and how a gateway result is
 * turned into an order state change.
 *
 * Controllers call `initiatePayment` / `handleCallback` and never import a provider,
 * so adding Fonepay or IME Pay means writing one provider file and adding it to
 * `PROVIDERS` below - no controller, order or client change.
 *
 * Every rule the spec insists on is enforced here rather than in a provider, so it
 * cannot be forgotten when a gateway is added:
 *   - the charged amount always comes from the persisted order total
 *   - a result is only believed after a server-to-server verification
 *   - the verified amount must equal the amount we asked for
 *   - a replayed callback is a no-op
 *   - one gateway transaction id can only ever settle one payment
 */

const PROVIDERS = {
  [PAYMENT_METHODS.KHALTI]: KhaltiProvider,
  [PAYMENT_METHODS.ESEWA]: EsewaProvider,
  [PAYMENT_METHODS.COD]: CodProvider,
};

export function getProvider(gateway) {
  const provider = PROVIDERS[gateway];
  if (!provider) throw ApiError.badRequest(`Unsupported payment method: ${gateway}`);
  return provider;
}

/** Online methods that are both switched on in settings and actually configured. */
export async function availableGateways() {
  const settings = await getSettings();
  return ONLINE_PAYMENT_METHODS.filter(
    (gateway) => settings.payments?.[gateway]?.isEnabled && PROVIDERS[gateway].isConfigured()
  );
}

const callbackUrl = (gateway) => `${env.serverUrl}/api/payments/${gateway}/callback`;

/** Where the browser is sent once the backend has finished verifying. */
export function clientRedirect({ order, status, reason }) {
  if (status === 'paid') return `${env.clientUrl}/order-success/${order.orderNumber}`;
  const params = new URLSearchParams({ order: order.orderNumber, status });
  if (reason) params.set('reason', reason);
  return `${env.clientUrl}/payment-failed?${params.toString()}`;
}

/**
 * Starts (or retries) an online payment for an existing order.
 *
 * The customer may switch gateway between attempts - a Khalti failure followed by an
 * eSewa success is a normal, supported path - and each attempt gets its own Payment
 * row and its own reference, which is what keeps the audit trail readable.
 */
export async function initiatePayment({ orderId, gateway, user }) {
  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');

  // Guests own an order only through the reference in their browser; signed-in
  // customers must own it outright.
  if (order.user && (!user || String(order.user) !== String(user._id))) {
    throw ApiError.forbidden('This order belongs to another account');
  }

  const method = gateway ?? order.paymentMethod;
  if (!ONLINE_PAYMENT_METHODS.includes(method)) {
    throw ApiError.badRequest('That payment method cannot be paid online');
  }
  if (order.paymentStatus === PAYMENT_STATUS.PAID) {
    throw ApiError.conflict('This order has already been paid');
  }
  if ([ORDER_STATUS.CANCELLED, ORDER_STATUS.REFUNDED].includes(order.status)) {
    throw ApiError.conflict('This order is no longer open for payment');
  }

  const settings = await getSettings();
  if (!settings.payments?.[method]?.isEnabled) {
    throw ApiError.badRequest(`${getProvider(method).label} payments are currently unavailable`);
  }

  const provider = getProvider(method);
  const attempt = (await Payment.countDocuments({ order: order._id })) + 1;

  const payment = await Payment.create({
    order: order._id,
    orderNumber: order.orderNumber,
    user: order.user ?? null,
    gateway: method,
    // Authoritative amount: the server-calculated order total, in whole rupees.
    amount: order.pricing.total,
    gatewayRef: paymentReference(order.orderNumber, attempt),
    attempt,
    status: PAYMENT_STATUS.PENDING,
    requestSnapshot: { amount: order.pricing.total, itemCount: order.itemCount },
  });

  let result;
  try {
    result = await provider.initiate({
      order,
      payment,
      returnUrl: callbackUrl(method),
      failureUrl: `${callbackUrl(method)}?result=failure`,
    });
  } catch (error) {
    payment.status = PAYMENT_STATUS.FAILED;
    payment.failureReason = `Initiation failed: ${error.message}`.slice(0, 400);
    await payment.save();
    throw error;
  }

  payment.responseSnapshot = { ...(payment.responseSnapshot ?? {}), ...(result.snapshot ?? {}) };
  await payment.save();

  if (order.paymentMethod !== method) {
    order.paymentMethod = method;
    order.pushTimeline(order.status, `Payment method changed to ${provider.label}`);
    await order.save();
  }

  logger.info(
    `Payment ${payment.gatewayRef} initiated via ${provider.label} for Rs. ${payment.amount}`
  );

  const { snapshot, ...clientSafe } = result;
  return {
    paymentId: payment._id,
    gateway: method,
    orderNumber: order.orderNumber,
    amount: payment.amount,
    ...clientSafe,
  };
}

/**
 * Handles a gateway return, in the one order that matters: identify the attempt,
 * verify server-side, check the amount, then change order state.
 *
 * Never throws for an ordinary business outcome (cancelled, expired, still pending)
 * - those are results, and the caller redirects the customer accordingly. It throws
 * only for things that should never happen: an unknown reference, a bad signature,
 * or an amount that does not match.
 */
export async function handleCallback({ gateway, callbackData = {} }) {
  const provider = getProvider(gateway);

  const reference = provider.extractRef(callbackData);
  if (!reference) {
    throw ApiError.badRequest('Payment callback is missing its order reference', {
      code: 'UNKNOWN_TRANSACTION',
    });
  }

  const payment = await Payment.findOne({ gateway, gatewayRef: reference });
  if (!payment) {
    logger.error(`Unknown ${gateway} payment reference in callback: ${reference}`);
    throw ApiError.notFound('We have no record of that payment', { code: 'UNKNOWN_TRANSACTION' });
  }

  const order = await Order.findById(payment.order);
  if (!order) throw ApiError.notFound('Order not found for this payment');

  // Replay: the customer refreshed the return page, or the gateway retried. Return
  // the settled result instead of touching stock or coupons a second time.
  if (payment.status === PAYMENT_STATUS.PAID) {
    logger.info(`Duplicate ${gateway} callback for ${reference} ignored (already settled)`);
    return { status: 'paid', order, payment, alreadyProcessed: true };
  }

  const result = await provider.verify({ payment, callbackData });

  if (result.status !== 'paid') {
    return recordUnsuccessful({ order, payment, result });
  }

  // A second successful attempt on an already-paid order is a real double charge:
  // settle the record, keep the order untouched, and flag it for a refund.
  if (order.paymentStatus === PAYMENT_STATUS.PAID) {
    logger.error(
      `DOUBLE PAYMENT on ${order.orderNumber}: attempt ${payment.attempt} (${reference}) succeeded after the order was already paid - refund required`
    );
    await settlePayment(payment, result);
    return { status: 'paid', order, payment, alreadyProcessed: true, requiresRefund: true };
  }

  // The gateway must have collected exactly what we asked for. Anything else means
  // the amount was tampered with in flight, or a stale reference is being replayed.
  if (result.amount !== payment.amount) {
    logger.error(
      `AMOUNT MISMATCH on ${order.orderNumber}: expected Rs. ${payment.amount}, gateway reported Rs. ${result.amount}`
    );
    payment.status = PAYMENT_STATUS.FAILED;
    payment.failureReason = `Amount mismatch: expected ${payment.amount}, received ${result.amount}`;
    payment.responseSnapshot = { ...(payment.responseSnapshot ?? {}), ...result.raw };
    await payment.save();
    throw ApiError.badRequest('The paid amount does not match this order. Please contact support.', {
      code: 'AMOUNT_MISMATCH',
    });
  }

  // One gateway transaction can only ever settle one of our payments.
  if (result.transactionId) {
    const clash = await Payment.findOne({
      transactionId: result.transactionId,
      _id: { $ne: payment._id },
    });
    if (clash) {
      logger.error(
        `Transaction ${result.transactionId} is already recorded against ${clash.orderNumber}`
      );
      throw ApiError.conflict('This transaction has already been used for another order', {
        code: 'TRANSACTION_REUSED',
      });
    }
  }

  await settlePayment(payment, result);
  const { order: updatedOrder } = await confirmOrderPayment({ orderId: order._id, payment });

  logger.info(
    `Payment ${reference} verified: Rs. ${payment.amount} via ${provider.label} (txn ${result.transactionId ?? 'n/a'})`
  );

  return { status: 'paid', order: updatedOrder, payment, alreadyProcessed: false };
}

async function settlePayment(payment, result) {
  payment.status = PAYMENT_STATUS.PAID;
  payment.transactionId = result.transactionId ?? null;
  payment.verifiedAt = new Date();
  payment.failureReason = undefined;
  payment.responseSnapshot = { ...(payment.responseSnapshot ?? {}), ...result.raw };
  await payment.save();
  return payment;
}

/** Cancelled, expired, failed or still-pending outcomes, recorded without drama. */
async function recordUnsuccessful({ order, payment, result }) {
  const isPending = result.status === 'pending';
  payment.status = isPending ? PAYMENT_STATUS.PENDING : PAYMENT_STATUS.FAILED;
  payment.failureReason = result.reason?.slice(0, 400);
  payment.responseSnapshot = { ...(payment.responseSnapshot ?? {}), ...result.raw };
  if (result.transactionId) payment.transactionId = result.transactionId;
  await payment.save();

  // The reservation is deliberately left in place: it expires on its own and the
  // customer can retry from the order page without losing their stock hold.
  if (!isPending) await markPaymentFailed({ orderId: order._id, reason: result.reason });

  logger.info(`Payment ${payment.gatewayRef} ended as ${result.status}: ${result.reason ?? ''}`);
  return { status: result.status, order, payment, alreadyProcessed: false };
}

/**
 * Admin "check again" for a payment stuck in pending - the same verification path
 * without a browser callback, useful when a customer closed the gateway tab midway.
 */
export async function reconcilePayment({ paymentId }) {
  const payment = await Payment.findById(paymentId);
  if (!payment) throw ApiError.notFound('Payment not found');
  if (payment.gateway === PAYMENT_METHODS.COD) {
    throw ApiError.badRequest('Cash on delivery payments cannot be reconciled with a gateway');
  }
  return handleCallback({ gateway: payment.gateway, callbackData: reconcileHint(payment) });
}

/** Rebuilds the minimum the provider needs to look a payment up again. */
function reconcileHint(payment) {
  if (payment.gateway === PAYMENT_METHODS.KHALTI) {
    return {
      purchase_order_id: payment.gatewayRef,
      pidx: payment.responseSnapshot?.pidx,
    };
  }
  return { transaction_uuid: payment.gatewayRef };
}

/**
 * Records a refund that was issued through the gateway's own merchant dashboard.
 * Khalti and eSewa both refund out-of-band for standard merchant accounts, so this
 * keeps our books straight without pretending we have an API we do not.
 */
export async function recordManualRefund({ paymentId, amount, reference, actor }) {
  const payment = await Payment.findById(paymentId);
  if (!payment) throw ApiError.notFound('Payment not found');
  if (payment.status !== PAYMENT_STATUS.PAID) {
    throw ApiError.badRequest('Only a settled payment can be refunded');
  }

  const refundAmount = amount ?? payment.amount;
  if (refundAmount <= 0 || refundAmount > payment.amount) {
    throw ApiError.badRequest(`Refund must be between Rs. 1 and Rs. ${payment.amount}`);
  }

  payment.status = PAYMENT_STATUS.REFUNDED;
  payment.refundedAt = new Date();
  payment.refundAmount = refundAmount;
  payment.refundReference = reference;
  await payment.save();

  logger.info(
    `Refund of Rs. ${refundAmount} recorded for ${payment.orderNumber} by ${actor?.email ?? 'system'}`
  );
  return payment;
}

export default {
  getProvider,
  availableGateways,
  initiatePayment,
  handleCallback,
  reconcilePayment,
  recordManualRefund,
  clientRedirect,
};
