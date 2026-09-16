import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import logger from '../config/logger.js';
import env from '../config/env.js';
import withTransaction, { sessionOption } from '../utils/transaction.js';
import { priceCart, assertOrderIsPlaceable } from './pricingService.js';
import { quoteCart, clearCart } from './cartService.js';
import { getSettings } from './settingsService.js';
import { estimatedDeliveryDate } from './deliveryService.js';
import { nextOrderNumber } from './orderNumberService.js';
import { redeemCoupon, releaseCoupon } from './couponService.js';
import {
  commitStock,
  linesFromOrder,
  releaseStock,
  reserveStock,
  restockItems,
} from './inventoryService.js';
import {
  notifyOrderPlaced,
  notifyOrderStatus,
  notifyPaymentConfirmed,
} from './notificationService.js';
import {
  COMMITTED_STATUSES,
  ONLINE_PAYMENT_METHODS,
  ORDER_STATUS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TRANSITIONS,
  PAYMENT_METHODS,
  PAYMENT_STATUS,
} from '../utils/constants.js';

/**
 * Order lifecycle. The only module allowed to write `Order.status`,
 * `Order.paymentStatus` and `Order.stockState`, which keeps the state machine in
 * one readable place and lets every transition be made idempotent.
 *
 * Payment *gateway* logic lives in `payments/` - this service only reacts to a
 * verified result, so adding a third gateway never touches order code.
 */

async function assertPaymentMethodAllowed({ method, total, deliveryQuote }) {
  const settings = await getSettings();
  const config = settings.payments?.[method];
  if (!config?.isEnabled) {
    throw ApiError.badRequest('That payment method is currently unavailable');
  }
  if (method === PAYMENT_METHODS.COD) {
    if (deliveryQuote && deliveryQuote.codAvailable === false) {
      throw ApiError.badRequest('Cash on delivery is not available for your area');
    }
    const max = settings.payments.cod.maxOrderAmount ?? 0;
    if (max > 0 && total > max) {
      throw ApiError.badRequest(
        `Cash on delivery is available for orders up to Rs. ${max}. Please pay with Khalti or eSewa.`
      );
    }
  }
}

/**
 * Creates an order from the customer's cart (or a guest's posted items).
 *
 * Prices are recomputed here from the database - the request body's only influence
 * on money is the coupon code and the delivery address, both of which are
 * validated server-side.
 */
export async function createOrder({ user, body, ip }) {
  const settings = await getSettings();
  if (!user && !settings.commerce.allowGuestCheckout) {
    throw ApiError.unauthorized('Please sign in to place an order');
  }

  const items = user
    ? (await quoteCart({ user })).quote.lines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
      }))
    : (body.items ?? []).map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
      }));

  if (!items.length) throw ApiError.badRequest('Your cart is empty');

  const quote = await priceCart({
    items,
    couponCode: body.couponCode,
    address: body.shippingAddress,
    paymentMethod: body.paymentMethod,
    user,
    email: body.customer.email,
    enforceStock: true,
  });

  assertOrderIsPlaceable(quote);
  await assertPaymentMethodAllowed({
    method: body.paymentMethod,
    total: quote.pricing.total,
    deliveryQuote: quote.delivery,
  });

  const isOnline = ONLINE_PAYMENT_METHODS.includes(body.paymentMethod);
  const initialStatus = isOnline ? ORDER_STATUS.PAYMENT_PENDING : ORDER_STATUS.PENDING;

  const order = await withTransaction(async (session) => {
    await reserveStock(
      quote.lines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
        name: line.name,
        size: line.size,
      })),
      session
    );

    const orderNumber = await nextOrderNumber(session);

    const [created] = await Order.create(
      [
        {
          orderNumber,
          user: user?._id ?? null,
          isGuest: !user,
          customer: {
            name: body.customer.name,
            email: body.customer.email,
            phone: body.customer.phone,
          },
          items: quote.lines.map((line) => ({
            product: line.productId,
            variantId: line.variantId,
            name: line.name,
            nameNp: line.nameNp,
            slug: line.slug,
            sku: line.sku,
            image: line.image,
            size: line.size,
            weightGrams: line.weightGrams,
            listPrice: line.listPrice,
            unitPrice: line.unitPrice,
            quantity: line.quantity,
            lineTotal: line.lineTotal,
          })),
          shippingAddress: body.shippingAddress,
          pricing: quote.pricing,
          coupon: quote.coupon
            ? {
                code: quote.coupon.code,
                couponId: quote.coupon.id,
                discountType: quote.coupon.discountType,
                discountValue: quote.coupon.discountValue,
              }
            : undefined,
          delivery: {
            zoneId: quote.delivery?.zoneId ?? undefined,
            zoneName: quote.delivery?.zoneName,
            estimatedDaysMin: quote.delivery?.estimatedDays?.min,
            estimatedDaysMax: quote.delivery?.estimatedDays?.max,
            estimatedDeliveryDate: estimatedDeliveryDate(quote.delivery?.estimatedDays),
          },
          paymentMethod: body.paymentMethod,
          paymentStatus: PAYMENT_STATUS.PENDING,
          status: initialStatus,
          stockState: 'reserved',
          customerNote: body.customerNote,
          reservationExpiresAt: new Date(Date.now() + env.reservationTtlMinutes * 60_000),
          timeline: [
            {
              status: initialStatus,
              note: isOnline
                ? 'Order created, waiting for payment'
                : 'Order placed with cash on delivery',
              at: new Date(),
            },
          ],
        },
      ],
      sessionOption(session)
    );

    if (user) await clearCart(user._id, session);
    return created;
  });

  logger.info(`Order ${order.orderNumber} created (${body.paymentMethod}, Rs. ${order.pricing.total}, ip=${ip ?? 'n/a'})`);

  // COD needs no gateway round-trip, so the confirmation email can go out now.
  // Online orders wait until the payment is verified.
  if (!isOnline) notifyOrderPlaced(order);

  return { order, quote };
}

/**
 * Marks an order paid after a *server-verified* gateway result and moves the
 * reservation into a real stock deduction.
 *
 * Idempotent by design: a replayed callback finds `paymentStatus === 'paid'` and
 * returns immediately, so stock is never deducted twice and a coupon is never
 * counted twice.
 */
export async function confirmOrderPayment({ orderId, payment }) {
  return withTransaction(async (session) => {
    const order = await Order.findById(orderId).session(session ?? null);
    if (!order) throw ApiError.notFound('Order not found');

    if (order.paymentStatus === PAYMENT_STATUS.PAID) {
      logger.info(`Duplicate payment confirmation ignored for ${order.orderNumber}`);
      return { order, alreadyProcessed: true };
    }
    if (order.status === ORDER_STATUS.CANCELLED) {
      throw ApiError.conflict('This order was cancelled and cannot be marked as paid');
    }

    if (order.stockState === 'reserved') {
      await commitStock(linesFromOrder(order), session);
      order.stockState = 'committed';
    }

    order.paymentStatus = PAYMENT_STATUS.PAID;
    order.status = ORDER_STATUS.PAID;
    order.paidAt = new Date();
    order.payment = payment?._id ?? order.payment;
    order.reservationExpiresAt = undefined;
    order.pushTimeline(
      ORDER_STATUS.PAID,
      `Payment verified via ${payment?.gateway ?? order.paymentMethod}`
    );
    await order.save({ session });

    if (order.coupon?.couponId) {
      await redeemCoupon(
        {
          couponId: order.coupon.couponId,
          code: order.coupon.code,
          user: order.user ? { _id: order.user } : null,
          email: order.customer.email,
          order,
          discountAmount: order.pricing.couponDiscount,
        },
        session
      );
    }

    if (order.user) {
      await User.updateOne(
        { _id: order.user },
        { $inc: { orderCount: 1, totalSpent: order.pricing.total } },
        sessionOption(session)
      );
    }

    return { order, alreadyProcessed: false };
  }).then(async ({ order, alreadyProcessed }) => {
    if (!alreadyProcessed) {
      notifyOrderPlaced(order);
      if (payment) notifyPaymentConfirmed(order, payment);
    }
    return { order, alreadyProcessed };
  });
}

/** Records a verified failure without touching the reservation (the customer may retry). */
export async function markPaymentFailed({ orderId, reason }) {
  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');
  if (order.paymentStatus === PAYMENT_STATUS.PAID) return order;

  order.paymentStatus = PAYMENT_STATUS.FAILED;
  order.pushTimeline(order.status, reason ? `Payment failed: ${reason}` : 'Payment failed');
  await order.save();
  return order;
}

/**
 * Admin status transition with the side effects each step implies.
 * Illegal jumps (e.g. delivered -> packed) are rejected by the transition table.
 */
export async function updateOrderStatus({ orderId, status, actor, note, tracking }) {
  const order = await withTransaction(async (session) => {
    const found = await Order.findById(orderId).session(session ?? null);
    if (!found) throw ApiError.notFound('Order not found');

    if (found.status === status) return found;

    const allowed = ORDER_STATUS_TRANSITIONS[found.status] ?? [];
    if (!allowed.includes(status)) {
      throw ApiError.badRequest(
        `Cannot move an order from ${ORDER_STATUS_LABELS[found.status]} to ${ORDER_STATUS_LABELS[status]}`
      );
    }

    if (status === ORDER_STATUS.CANCELLED) {
      await unwindStock(found, session);
      found.cancelledAt = new Date();
      found.cancelReason = note;
    } else if (status === ORDER_STATUS.REFUNDED) {
      if (found.stockState === 'committed') {
        await restockItems(linesFromOrder(found), session);
        found.stockState = 'restocked';
      }
      found.paymentStatus = PAYMENT_STATUS.REFUNDED;
      found.refundedAt = new Date();
      found.refundAmount = found.pricing.total;
    } else if (COMMITTED_STATUSES.includes(status) && found.stockState === 'reserved') {
      // Reached when an admin confirms a cash-on-delivery order: this is the point
      // at which reserved stock actually leaves the shelf.
      await commitStock(linesFromOrder(found), session);
      found.stockState = 'committed';
      found.reservationExpiresAt = undefined;
    }

    if (status === ORDER_STATUS.PACKED) found.packedAt = new Date();
    if (status === ORDER_STATUS.SHIPPED) found.shippedAt = new Date();
    if (status === ORDER_STATUS.DELIVERED) {
      found.deliveredAt = new Date();
      if (found.paymentMethod === PAYMENT_METHODS.COD) {
        found.paymentStatus = PAYMENT_STATUS.PAID;
        found.paidAt = found.paidAt ?? new Date();
      }
    }

    if (tracking?.trackingNumber) found.delivery.trackingNumber = tracking.trackingNumber;
    if (tracking?.courier) found.delivery.courier = tracking.courier;

    found.status = status;
    found.pushTimeline(status, note, actor);
    await found.save({ session });
    return found;
  });

  notifyOrderStatus(order, status);
  return order;
}

/** Cancellation initiated by the customer, allowed only before fulfilment starts. */
export async function cancelOrderByCustomer({ orderId, user, reason }) {
  const order = await withTransaction(async (session) => {
    const found = await Order.findOne({ _id: orderId, user: user._id }).session(session ?? null);
    if (!found) throw ApiError.notFound('Order not found');
    if (!found.isCancellable) {
      throw ApiError.badRequest(
        'This order can no longer be cancelled. Please contact us and we will help.'
      );
    }

    await unwindStock(found, session);
    found.status = ORDER_STATUS.CANCELLED;
    found.cancelledAt = new Date();
    found.cancelReason = reason || 'Cancelled by customer';
    if (found.paymentStatus === PAYMENT_STATUS.PAID) {
      found.paymentStatus = PAYMENT_STATUS.REFUNDED;
      found.refundedAt = new Date();
      found.refundAmount = found.pricing.total;
    }
    found.pushTimeline(ORDER_STATUS.CANCELLED, found.cancelReason, user);
    await found.save({ session });
    return found;
  });

  notifyOrderStatus(order, ORDER_STATUS.CANCELLED);
  return order;
}

/**
 * Returns stock and coupon usage to the pool, whichever stage the order reached.
 * Safe to call twice - `stockState` gates each branch.
 */
async function unwindStock(order, session) {
  if (order.stockState === 'reserved') {
    await releaseStock(linesFromOrder(order), session);
    order.stockState = 'released';
  } else if (order.stockState === 'committed') {
    await restockItems(linesFromOrder(order), session);
    order.stockState = 'restocked';
  }
  if (order.coupon?.couponId) {
    await releaseCoupon({ couponId: order.coupon.couponId, orderId: order._id }, session);
  }
  if (order.user && order.paymentStatus === PAYMENT_STATUS.PAID) {
    await User.updateOne(
      { _id: order.user },
      { $inc: { orderCount: -1, totalSpent: -order.pricing.total } },
      sessionOption(session)
    );
  }
}

/**
 * Guest order lookup: order number plus the phone or email used at checkout.
 * Deliberately requires both halves so an order number alone leaks nothing.
 */
export async function trackOrder({ orderNumber, phone, email }) {
  const query = { orderNumber: String(orderNumber).trim().toUpperCase() };
  if (phone) query['customer.phone'] = String(phone).replace(/\D/g, '').slice(-10);
  else if (email) query['customer.email'] = String(email).toLowerCase().trim();
  else throw ApiError.badRequest('Enter the phone number or email used on the order');

  const order = await Order.findOne(query).select(
    'orderNumber status paymentStatus paymentMethod items pricing delivery timeline createdAt paidAt shippedAt deliveredAt customer.name shippingAddress'
  );
  if (!order) {
    throw ApiError.notFound(
      'We could not find that order. Please check the order number and the phone/email you used.'
    );
  }
  return order;
}

/** Latest payment attempt for an order, used by the retry-payment flow. */
export async function latestPayment(orderId) {
  return Payment.findOne({ order: orderId }).sort({ createdAt: -1 });
}

export default {
  createOrder,
  confirmOrderPayment,
  markPaymentFailed,
  updateOrderStatus,
  cancelOrderByCustomer,
  trackOrder,
  latestPayment,
};
