import { z } from 'zod';
import { objectId, quantity, optionalText, requiredText, email, nepaliPhone, addressInput } from './common.js';
import { PAYMENT_METHOD_VALUES, ONLINE_PAYMENT_METHODS, ORDER_STATUS_VALUES } from '../utils/constants.js';

/**
 * Cart, checkout and order shapes.
 *
 * Note what is *absent*: no price, no total, no discount amount. The client may say
 * what it wants to buy and where to send it; every number is computed server-side, so
 * a tampered request can change the order but never the amount charged.
 */

export const guestCartItems = z
  .array(
    z.object({
      productId: objectId,
      variantId: objectId,
      quantity,
    })
  )
  .max(50, 'That is too many different items for one order');

export const addToCartSchema = z.object({
  productId: objectId,
  variantId: objectId,
  quantity: quantity.default(1),
  // Anonymous funnel id for the add-to-cart event; never linked to an IP address.
  sessionId: optionalText(64),
});

export const updateCartItemSchema = z
  .object({
    quantity: z.coerce.number().int().min(0).max(20).optional(),
    variantId: objectId.optional(),
  })
  .refine((value) => value.quantity !== undefined || value.variantId, {
    message: 'Nothing to update',
  });

export const cartItemParams = z.object({ itemId: objectId });

/**
 * Guest wishlist hand-off at sign-in. Ids only, and duplicates are the controller's
 * problem rather than a validation error: a returning customer whose local list
 * overlaps their saved one should just sign in, not read an error message.
 */
export const wishlistMergeSchema = z.object({
  productIds: z.array(objectId).max(200, 'That is too many items to merge').default([]),
});

export const applyCouponSchema = z.object({
  code: requiredText(30, 'Coupon code').transform((value) => value.toUpperCase()),
});

/**
 * Guest coupon preview: the items travel with the request because there is no
 * server-side cart to price against yet. Still priced entirely server-side - the
 * client sends ids and quantities, never amounts.
 */
export const previewCouponSchema = z.object({
  code: requiredText(30, 'Coupon code').transform((value) => value.toUpperCase()),
  items: guestCartItems.optional(),
});

/** Guest cart hand-off at sign-in. */
export const mergeCartSchema = z.object({
  items: guestCartItems.default([]),
});

/** Quote request from the cart or checkout page - safe to call as often as needed. */
export const quoteSchema = z.object({
  items: guestCartItems.optional(),
  couponCode: optionalText(30),
  paymentMethod: z.enum(PAYMENT_METHOD_VALUES).optional(),
  address: z
    .object({
      province: optionalText(60),
      district: optionalText(60),
    })
    .optional(),
});

export const deliveryQuoteQuery = z.object({
  district: optionalText(60),
  province: optionalText(60),
  subtotal: z.coerce.number().int().min(0).default(0),
  paymentMethod: z.enum(PAYMENT_METHOD_VALUES).optional(),
});

export const createOrderSchema = z.object({
  customer: z.object({
    name: requiredText(80, 'Your name'),
    email,
    phone: nepaliPhone,
  }),
  shippingAddress: addressInput,
  // Only sent by guests; a signed-in customer's order is built from their saved cart.
  items: guestCartItems.optional(),
  paymentMethod: z.enum(PAYMENT_METHOD_VALUES, { message: 'Choose a payment method' }),
  couponCode: optionalText(30),
  customerNote: optionalText(500),
  saveAddress: z.boolean().optional().default(false),
  // Anonymous funnel id, never linked to an IP address.
  sessionId: optionalText(64),
});

export const orderListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(12),
  status: z.enum(ORDER_STATUS_VALUES).optional(),
  paymentStatus: z.enum(['pending', 'paid', 'failed', 'refunded']).optional(),
  paymentMethod: z.enum(PAYMENT_METHOD_VALUES).optional(),
  q: optionalText(80),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  sort: z.enum(['newest', 'oldest', 'total-high', 'total-low']).default('newest'),
});

export const orderNumberParams = z.object({
  orderNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^ACH-\d{4}-\d{6}$/, 'That does not look like an order number'),
});

export const trackOrderSchema = z
  .object({
    orderNumber: orderNumberParams.shape.orderNumber,
    phone: nepaliPhone.optional(),
    email: email.optional(),
  })
  .refine((value) => value.phone || value.email, {
    message: 'Enter the phone number or email you used on the order',
    path: ['phone'],
  });

export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUS_VALUES),
  note: optionalText(400),
  trackingNumber: optionalText(60),
  courier: optionalText(60),
});

export const cancelOrderSchema = z.object({ reason: optionalText(300) });

export const adminNoteSchema = z.object({ adminNote: optionalText(1000) });

// --- Payments ----------------------------------------------------------------

export const initiatePaymentSchema = z.object({
  orderId: objectId.optional(),
  orderNumber: orderNumberParams.shape.orderNumber.optional(),
  gateway: z.enum(ONLINE_PAYMENT_METHODS, { message: 'Choose Khalti or eSewa' }),
  // Guest access token issued at checkout; ignored for signed-in customers.
  token: optionalText(64),
}).refine((value) => value.orderId || value.orderNumber, {
  message: 'An order reference is required',
  path: ['orderId'],
});

/** `?token=` on guest order/payment reads. Loose so it can be merged into any query. */
export const guestTokenQuery = z.object({ token: optionalText(64) }).loose();

/**
 * Gateway callbacks are loose on purpose: providers add query parameters over time,
 * and a strict schema here would turn a harmless extra field into a failed payment.
 * The provider extracts and verifies what it needs; nothing here is trusted.
 */
export const khaltiCallbackQuery = z
  .object({
    pidx: optionalText(120),
    purchase_order_id: optionalText(120),
    transaction_id: optionalText(120),
    status: optionalText(60),
    amount: optionalText(20),
    total_amount: optionalText(20),
  })
  .loose();

export const esewaCallbackQuery = z
  .object({
    data: optionalText(4000),
    transaction_uuid: optionalText(120),
    result: optionalText(30),
  })
  .loose();

export const refundSchema = z.object({
  amount: z.coerce.number().int().min(1).optional(),
  reference: optionalText(120),
  note: optionalText(300),
});

export const paymentListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(20),
  gateway: z.enum(PAYMENT_METHOD_VALUES).optional(),
  status: z.enum(['pending', 'paid', 'failed', 'refunded']).optional(),
  q: optionalText(80),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

export default {
  guestCartItems,
  addToCartSchema,
  updateCartItemSchema,
  cartItemParams,
  wishlistMergeSchema,
  applyCouponSchema,
  previewCouponSchema,
  mergeCartSchema,
  quoteSchema,
  deliveryQuoteQuery,
  createOrderSchema,
  orderListQuery,
  orderNumberParams,
  trackOrderSchema,
  updateOrderStatusSchema,
  cancelOrderSchema,
  adminNoteSchema,
  initiatePaymentSchema,
  guestTokenQuery,
  khaltiCallbackQuery,
  esewaCallbackQuery,
  refundSchema,
  paymentListQuery,
};
