import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { get, post, patch, del, apiError } from '../lib/apiClient';
import { useAuth } from './AuthContext';

/**
 * The cart.
 *
 * One rule shapes this whole file: **the client never computes money.** Every price,
 * discount, delivery charge and total in `quote` came from the server. A guest's cart
 * lives in localStorage as `{productId, variantId, quantity}` only - no prices - and is
 * posted to `POST /api/cart/quote` to be priced. A signed-in customer's cart lives in
 * the database. Both return the identical envelope, so components have one shape to
 * render and there is no path by which a tampered localStorage value changes a charge.
 *
 * On sign-in the guest cart is handed to the API to merge, then cleared locally.
 */

const CartContext = createContext(null);

const STORAGE_KEY = 'ag_cart';

const EMPTY_QUOTE = {
  items: [],
  removed: [],
  issues: [],
  coupon: null,
  couponError: null,
  delivery: null,
  pricing: { subtotal: 0, itemDiscount: 0, couponDiscount: 0, deliveryCharge: 0, total: 0 },
};

/** Reads the guest cart. Tolerates corrupt JSON rather than crashing the app. */
function readLocal() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item?.productId && item?.variantId)
      .map((item) => ({
        productId: String(item.productId),
        variantId: String(item.variantId),
        quantity: Math.min(20, Math.max(1, Number(item.quantity) || 1)),
      }))
      .slice(0, 50);
  } catch {
    return [];
  }
}

function writeLocal(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Private browsing / quota. The cart degrades to session-only, which is acceptable.
  }
}

export function CartProvider({ children }) {
  const { isAuthenticated, ready } = useAuth();

  const [guestItems, setGuestItems] = useState(readLocal);
  const [quote, setQuote] = useState(EMPTY_QUOTE);
  const [loading, setLoading] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [open, setOpen] = useState(false);

  // Tracks the previous auth state so the merge fires exactly once, on the transition.
  const wasAuthenticated = useRef(null);

  useEffect(() => {
    writeLocal(guestItems);
  }, [guestItems]);

  /** Prices whatever cart is current. The single point where a quote is produced. */
  const reprice = useCallback(
    async ({ items, coupon } = {}) => {
      const effectiveItems = items ?? guestItems;
      setLoading(true);
      try {
        if (isAuthenticated) {
          const data = await get('/cart');
          setQuote(data ?? EMPTY_QUOTE);
          return data;
        }
        if (!effectiveItems.length) {
          setQuote(EMPTY_QUOTE);
          return EMPTY_QUOTE;
        }
        const data = await post('/cart/quote', {
          items: effectiveItems,
          couponCode: coupon ?? couponCode ?? undefined,
        });
        setQuote(data ?? EMPTY_QUOTE);
        return data;
      } catch {
        // A pricing failure must not wipe the cart - the items are still valid, we just
        // could not price them this second.
        return null;
      } finally {
        setLoading(false);
      }
    },
    [isAuthenticated, guestItems, couponCode]
  );

  /**
   * Hands the guest cart to the API at sign-in, then clears it locally. Runs on the
   * false -> true transition only; `mergeGuestCart` is idempotent server-side but
   * re-posting on every render would be pointless traffic.
   */
  useEffect(() => {
    if (!ready) return;

    const previous = wasAuthenticated.current;
    wasAuthenticated.current = isAuthenticated;

    (async () => {
      if (isAuthenticated && previous === false && guestItems.length) {
        try {
          const data = await post('/cart/merge', { items: guestItems });
          setQuote(data ?? EMPTY_QUOTE);
          setGuestItems([]);
          return;
        } catch {
          // Fall through to a plain load; the items stay in localStorage for a retry.
        }
      }
      await reprice();
    })();
    // `reprice` and `guestItems` are intentionally out of the dep list: this effect is
    // about the auth transition, and including them would re-run it on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, ready]);

  // --- Mutations --------------------------------------------------------------

  const addItem = useCallback(
    async ({ productId, variantId, quantity = 1 }) => {
      if (isAuthenticated) {
        const data = await post('/cart/items', { productId, variantId, quantity });
        setQuote(data ?? EMPTY_QUOTE);
        return data;
      }
      // Guest: merge into the existing line for the same variant rather than adding a
      // duplicate row, and cap at the same 20 the server allows.
      const next = (() => {
        const existing = guestItems.find(
          (item) => item.productId === productId && item.variantId === variantId
        );
        if (!existing) {
          return [...guestItems, { productId, variantId, quantity: Math.min(20, quantity) }];
        }
        return guestItems.map((item) =>
          item === existing
            ? { ...item, quantity: Math.min(20, item.quantity + quantity) }
            : item
        );
      })();
      setGuestItems(next);
      return reprice({ items: next });
    },
    [isAuthenticated, guestItems, reprice]
  );

  const updateItem = useCallback(
    async (line, quantity) => {
      if (quantity <= 0) return removeItemRef.current(line);

      if (isAuthenticated) {
        const data = await patch(`/cart/items/${line.itemId}`, { quantity });
        setQuote(data ?? EMPTY_QUOTE);
        return data;
      }
      const next = guestItems.map((item) =>
        item.productId === String(line.productId) && item.variantId === String(line.variantId)
          ? { ...item, quantity }
          : item
      );
      setGuestItems(next);
      return reprice({ items: next });
    },
    [isAuthenticated, guestItems, reprice]
  );

  const removeItem = useCallback(
    async (line) => {
      if (isAuthenticated) {
        const data = await del(`/cart/items/${line.itemId}`);
        setQuote(data ?? EMPTY_QUOTE);
        return data;
      }
      const next = guestItems.filter(
        (item) =>
          !(item.productId === String(line.productId) && item.variantId === String(line.variantId))
      );
      setGuestItems(next);
      return reprice({ items: next });
    },
    [isAuthenticated, guestItems, reprice]
  );

  // `updateItem` needs to call `removeItem`, which is declared after it.
  const removeItemRef = useRef(removeItem);
  useEffect(() => {
    removeItemRef.current = removeItem;
  }, [removeItem]);

  const clear = useCallback(async () => {
    if (isAuthenticated) {
      const data = await del('/cart');
      setQuote(data ?? EMPTY_QUOTE);
      return data;
    }
    setGuestItems([]);
    setCouponCode('');
    setQuote(EMPTY_QUOTE);
    return EMPTY_QUOTE;
  }, [isAuthenticated]);

  /**
   * Applying a coupon is a server decision - it checks validity, expiry, minimum spend,
   * per-customer usage and category scope. All we do is send the code and render the
   * answer, including `couponError` when it is refused.
   */
  const applyCoupon = useCallback(
    async (code) => {
      const trimmed = String(code ?? '').trim().toUpperCase();
      if (!trimmed) return null;

      if (isAuthenticated) {
        const data = await post('/cart/coupon', { code: trimmed });
        setQuote(data ?? EMPTY_QUOTE);
        setCouponCode(trimmed);
        return data;
      }
      const data = await post('/cart/coupon/preview', { code: trimmed, items: guestItems });
      setQuote(data ?? EMPTY_QUOTE);
      setCouponCode(trimmed);
      return data;
    },
    [isAuthenticated, guestItems]
  );

  const removeCoupon = useCallback(async () => {
    setCouponCode('');
    if (isAuthenticated) {
      const data = await del('/cart/coupon');
      setQuote(data ?? EMPTY_QUOTE);
      return data;
    }
    return reprice({ items: guestItems, coupon: '' });
  }, [isAuthenticated, guestItems, reprice]);

  /**
   * Re-quotes with a delivery address so checkout can show the real delivery charge
   * before the order is placed. Nothing is persisted; the order recomputes it anyway.
   */
  const quoteFor = useCallback(
    async ({ address, paymentMethod } = {}) => {
      try {
        const data = await post('/cart/quote', {
          items: isAuthenticated ? undefined : guestItems,
          couponCode: couponCode || undefined,
          address,
          paymentMethod,
        });
        setQuote(data ?? EMPTY_QUOTE);
        return data;
      } catch (error) {
        return { error: apiError(error) };
      }
    },
    [isAuthenticated, guestItems, couponCode]
  );

  const items = quote.items ?? [];
  const count = items.reduce((sum, line) => sum + (line.quantity ?? 0), 0);

  const value = useMemo(
    () => ({
      quote,
      items,
      count,
      loading,
      pricing: quote.pricing ?? EMPTY_QUOTE.pricing,
      coupon: quote.coupon ?? null,
      couponError: quote.couponError ?? null,
      issues: quote.issues ?? [],
      isEmpty: items.length === 0,
      // Guest ids, needed at checkout so the order can be built without a server cart.
      guestItems,
      addItem,
      updateItem,
      removeItem,
      clear,
      applyCoupon,
      removeCoupon,
      reprice,
      quoteFor,
      // Mini-cart drawer visibility.
      open,
      openCart: () => setOpen(true),
      closeCart: () => setOpen(false),
    }),
    [
      quote,
      items,
      count,
      loading,
      guestItems,
      addItem,
      updateItem,
      removeItem,
      clear,
      applyCoupon,
      removeCoupon,
      reprice,
      quoteFor,
      open,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside <CartProvider>');
  return context;
}

export default CartContext;
