import asyncHandler from '../utils/asyncHandler.js';
import ApiError from '../utils/ApiError.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import {
  quoteCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
  setCoupon,
  mergeGuestCart,
} from '../services/cartService.js';
import { validateCoupon } from '../services/couponService.js';
import { priceCart } from '../services/pricingService.js';
import { track } from '../services/analyticsService.js';

/**
 * Cart.
 *
 * Signed-in customers have a server-side cart; guests keep the same item shape in
 * localStorage and post it with each request. Both paths return the identical
 * quote envelope, so the UI has one rendering path and one set of numbers.
 *
 * No handler here accepts a price. `POST /api/cart/quote` is a read of the current
 * catalogue and coupon state - safe to call on every keystroke, and impossible to
 * use to influence what an order will cost.
 */

/** One response shape for the cart, whoever is asking. */
function cartPayload(quote, cart = null) {
  return {
    cartId: cart ? String(cart._id) : null,
    items: quote.lines,
    removed: quote.removed,
    issues: quote.issues,
    coupon: quote.coupon,
    couponError: quote.couponError,
    delivery: quote.delivery,
    pricing: quote.pricing,
    meta: quote.meta,
  };
}

export const getCart = asyncHandler(async (req, res) => {
  const { quote, cart } = await quoteCart({ user: req.user });
  return sendSuccess(res, { data: cartPayload(quote, cart) });
});

/**
 * The quote endpoint. Serves both the cart page and the checkout preview: pass an
 * address to get delivery included, and a payment method to get COD surcharges.
 */
export const quote = asyncHandler(async (req, res) => {
  const { items, couponCode, address, paymentMethod } = req.body;

  if (req.user) {
    // A signed-in customer's cart is authoritative; `items` in the body is ignored.
    const { quote: priced, cart } = await quoteCart({
      user: req.user,
      couponCode,
      address,
      paymentMethod,
    });
    return sendSuccess(res, { data: cartPayload(priced, cart) });
  }

  const priced = await priceCart({
    items: items ?? [],
    couponCode,
    address,
    paymentMethod,
  });
  return sendSuccess(res, { data: cartPayload(priced) });
});

export const addToCart = asyncHandler(async (req, res) => {
  const { productId, variantId, quantity } = req.body;
  await addItem({ user: req.user, productId, variantId, quantity });

  const { quote: priced, cart } = await quoteCart({ user: req.user });

  // Reject only after the merge, so the response still reflects reality.
  const line = priced.lines.find(
    (item) => item.productId === String(productId) && item.variantId === String(variantId)
  );
  if (!line) {
    const reason = priced.removed.find(
      (item) => String(item.productId) === String(productId)
    )?.reason;
    throw ApiError.conflict(reason ?? 'That item is not available right now');
  }

  track({
    type: 'add_to_cart',
    sessionId: req.body.sessionId,
    user: req.user,
    product: productId,
    meta: { quantity: line.quantity },
  });

  return sendSuccess(res, { message: 'Added to cart', data: cartPayload(priced, cart) });
});

export const updateCartItem = asyncHandler(async (req, res) => {
  await updateItem({
    user: req.user,
    itemId: req.params.itemId,
    quantity: req.body.quantity,
    variantId: req.body.variantId,
  });
  const { quote: priced, cart } = await quoteCart({ user: req.user });
  return sendSuccess(res, { message: 'Cart updated', data: cartPayload(priced, cart) });
});

export const removeCartItem = asyncHandler(async (req, res) => {
  await removeItem({ user: req.user, itemId: req.params.itemId });
  const { quote: priced, cart } = await quoteCart({ user: req.user });
  return sendSuccess(res, { message: 'Item removed', data: cartPayload(priced, cart) });
});

export const emptyCart = asyncHandler(async (req, res) => {
  await clearCart(req.user._id);
  const { quote: priced, cart } = await quoteCart({ user: req.user });
  return sendSuccess(res, { message: 'Cart cleared', data: cartPayload(priced, cart) });
});

/**
 * Applying a coupon validates it against the live cart and reports the exact
 * discount, but stores only the code: the amount is always recomputed at
 * checkout, so a coupon that expires in between cannot be spent.
 */
export const applyCoupon = asyncHandler(async (req, res) => {
  const { code } = req.body;
  const { quote: current } = await quoteCart({ user: req.user });

  if (!current.lines.length) throw ApiError.badRequest('Add something to your cart first');

  // Throws with a customer-facing reason (expired, minimum not met, already used).
  await validateCoupon({ code, lines: current.lines, user: req.user, email: req.user.email });

  await setCoupon({ user: req.user, code });
  const { quote: priced, cart } = await quoteCart({ user: req.user });

  return sendSuccess(res, {
    message: `Coupon ${code} applied`,
    data: cartPayload(priced, cart),
  });
});

export const removeCoupon = asyncHandler(async (req, res) => {
  await setCoupon({ user: req.user, code: null });
  const { quote: priced, cart } = await quoteCart({ user: req.user });
  return sendSuccess(res, { message: 'Coupon removed', data: cartPayload(priced, cart) });
});

/**
 * Guest coupon check. Validates against the posted items without storing anything,
 * so the cart page can show the saving before the customer signs in.
 */
export const previewCoupon = asyncHandler(async (req, res) => {
  const priced = await priceCart({ items: req.body.items ?? [], couponCode: req.body.code });

  if (!priced.lines.length) throw ApiError.badRequest('Add something to your cart first');
  if (priced.couponError) throw ApiError.badRequest(priced.couponError);
  if (!priced.coupon) throw ApiError.badRequest('That coupon code is not valid');

  return sendSuccess(res, {
    message: `Coupon ${priced.coupon.code} applied`,
    data: cartPayload(priced),
  });
});

/** Called by the client right after login to fold in the localStorage cart. */
export const merge = asyncHandler(async (req, res) => {
  await mergeGuestCart({ user: req.user, items: req.body.items ?? [] });
  const { quote: priced, cart } = await quoteCart({ user: req.user });
  return sendSuccess(res, { message: 'Cart merged', data: cartPayload(priced, cart) });
});

export default {
  getCart,
  quote,
  addToCart,
  updateCartItem,
  removeCartItem,
  emptyCart,
  applyCoupon,
  removeCoupon,
  previewCoupon,
  merge,
};
