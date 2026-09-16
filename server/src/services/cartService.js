import Cart from '../models/Cart.js';
import ApiError from '../utils/ApiError.js';
import { priceCart } from './pricingService.js';
import { MAX_QTY_PER_ITEM } from '../utils/constants.js';

/**
 * Cart operations.
 *
 * Signed-in customers get a server-side cart (so it follows them between phone
 * and laptop); guests keep the identical `{productId, variantId, quantity}` shape
 * in localStorage and post it with each request. Both paths converge on
 * `pricingService.priceCart`, so a guest and a member always see the same maths.
 */

export async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) cart = await Cart.create({ user: userId, items: [] });
  return cart;
}

const toRawItems = (cart) =>
  (cart.items ?? []).map((item) => ({
    productId: String(item.product),
    variantId: String(item.variantId),
    quantity: item.quantity,
  }));

/**
 * Prices a cart and, for signed-in customers, self-heals the stored document:
 * unavailable lines are dropped and over-ordered quantities are clamped, so the
 * customer is never taken to checkout with a cart that cannot be fulfilled.
 */
export async function quoteCart({ user, items, couponCode, address, paymentMethod }) {
  let sourceItems = items;
  let cart = null;

  if (user) {
    cart = await getOrCreateCart(user._id);
    sourceItems = toRawItems(cart);
    couponCode = couponCode ?? cart.couponCode;
  }

  const quote = await priceCart({
    items: sourceItems ?? [],
    couponCode,
    address,
    paymentMethod,
    user,
    email: user?.email,
  });

  if (cart && (quote.removed.length || quote.issues.length)) {
    cart.items = quote.lines.map((line) => ({
      product: line.productId,
      variantId: line.variantId,
      quantity: line.quantity,
    }));
    if (quote.couponError) cart.couponCode = null;
    await cart.save();
  }

  // The pricing service knows nothing about cart documents, so it cannot supply the
  // subdocument id. The client needs one to address `PATCH /cart/items/:itemId`, so it
  // is stitched on here - after any self-heal save, because rewriting `cart.items`
  // mints new subdocument ids.
  if (cart) attachItemIds(quote, cart);

  return { quote, cart };
}

/** Adds `itemId` to each priced line by matching it back to its cart subdocument. */
function attachItemIds(quote, cart) {
  for (const line of quote.lines) {
    const match = (cart.items ?? []).find(
      (item) =>
        String(item.product) === String(line.productId) &&
        String(item.variantId) === String(line.variantId)
    );
    if (match) line.itemId = String(match._id);
  }
}

export async function addItem({ user, productId, variantId, quantity = 1 }) {
  const cart = await getOrCreateCart(user._id);
  const existing = cart.findItem(productId, variantId);
  const nextQuantity = Math.min((existing?.quantity ?? 0) + quantity, MAX_QTY_PER_ITEM);

  if (existing) existing.quantity = nextQuantity;
  else cart.items.push({ product: productId, variantId, quantity: Math.min(quantity, MAX_QTY_PER_ITEM) });

  await cart.save();
  return cart;
}

export async function updateItem({ user, itemId, quantity, variantId }) {
  const cart = await getOrCreateCart(user._id);
  const item = cart.items.id(itemId);
  if (!item) throw ApiError.notFound('That item is not in your cart');

  // Changing size is a swap, and may collide with a line that already exists.
  if (variantId && String(variantId) !== String(item.variantId)) {
    const duplicate = cart.items.find(
      (other) =>
        other._id.toString() !== itemId &&
        String(other.product) === String(item.product) &&
        String(other.variantId) === String(variantId)
    );
    if (duplicate) {
      duplicate.quantity = Math.min(duplicate.quantity + (quantity ?? item.quantity), MAX_QTY_PER_ITEM);
      cart.items.pull({ _id: itemId });
      await cart.save();
      return cart;
    }
    item.variantId = variantId;
  }

  if (quantity !== undefined) {
    if (quantity <= 0) cart.items.pull({ _id: itemId });
    else item.quantity = Math.min(quantity, MAX_QTY_PER_ITEM);
  }

  await cart.save();
  return cart;
}

export async function removeItem({ user, itemId }) {
  const cart = await getOrCreateCart(user._id);
  const item = cart.items.id(itemId);
  if (!item) throw ApiError.notFound('That item is not in your cart');
  cart.items.pull({ _id: itemId });
  await cart.save();
  return cart;
}

export async function clearCart(userId, session) {
  return Cart.findOneAndUpdate(
    { user: userId },
    { $set: { items: [], couponCode: null } },
    { new: true, ...(session ? { session } : {}) }
  );
}

export async function setCoupon({ user, code }) {
  const cart = await getOrCreateCart(user._id);
  cart.couponCode = code ? String(code).toUpperCase() : null;
  await cart.save();
  return cart;
}

/**
 * Called right after login: folds the guest's localStorage cart into their
 * account cart, taking the larger quantity per line rather than summing, which is
 * what customers expect when the same jar sits in both carts.
 */
export async function mergeGuestCart({ user, items = [] }) {
  if (!items.length) return getOrCreateCart(user._id);
  const cart = await getOrCreateCart(user._id);

  for (const incoming of items) {
    if (!incoming?.productId || !incoming?.variantId) continue;
    const quantity = Math.min(Math.max(1, Number(incoming.quantity) || 1), MAX_QTY_PER_ITEM);
    const existing = cart.findItem(incoming.productId, incoming.variantId);
    if (existing) existing.quantity = Math.min(Math.max(existing.quantity, quantity), MAX_QTY_PER_ITEM);
    else cart.items.push({ product: incoming.productId, variantId: incoming.variantId, quantity });
  }

  await cart.save();
  return cart;
}

export default {
  getOrCreateCart,
  quoteCart,
  addItem,
  updateItem,
  removeItem,
  clearCart,
  setCoupon,
  mergeGuestCart,
};
