/**
 * Guest order access tokens.
 *
 * A guest checkout returns a per-order token (an HMAC over the order number and its
 * creation time) which is the only way for someone without an account to read their own
 * order. The problem it solves here is the gateway round-trip: the browser leaves for
 * Khalti or eSewa entirely, and the API redirects it back to `/order-success/:orderNumber`
 * with no token in the URL, so anything held in React state is gone by then.
 *
 * **`sessionStorage`, deliberately not `localStorage`.** This is a read credential for one
 * order, not payment information - no card data, no gateway keys, no amounts are stored,
 * and the constraint against putting payment details in local storage stands. Session
 * storage keeps it for the tab that is mid-checkout and discards it when that tab closes,
 * which is exactly the lifetime the token needs. Anyone who loses it can still reach the
 * order through `/track-order` with their order number and phone or email.
 *
 * The token never appears in a URL we generate for sharing, and it is only ever sent as a
 * `?token=` query parameter on the order and payment-status endpoints.
 */

const KEY = 'ag_order_tokens';
const MAX_KEPT = 10;

function readAll() {
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // Private-mode Safari throws on access, and a corrupted value is not worth a crash.
    return {};
  }
}

function writeAll(map) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // Storage full or blocked: the customer falls back to /track-order.
  }
}

/** Remembers the token for an order. No-ops for a signed-in customer (no token issued). */
export function rememberOrderToken(orderNumber, token) {
  if (!orderNumber || !token) return;
  const map = readAll();
  map[orderNumber] = token;

  // Keep the map small. Insertion order is preserved for string keys, so dropping from
  // the front discards the oldest checkouts first.
  const keys = Object.keys(map);
  if (keys.length > MAX_KEPT) {
    for (const stale of keys.slice(0, keys.length - MAX_KEPT)) delete map[stale];
  }

  writeAll(map);
}

/** The token for an order, or `undefined`. Falls back to a router-state token. */
export function orderToken(orderNumber, fallback) {
  if (fallback) return fallback;
  if (!orderNumber) return undefined;
  return readAll()[orderNumber];
}

export function forgetOrderToken(orderNumber) {
  const map = readAll();
  if (!(orderNumber in map)) return;
  delete map[orderNumber];
  writeAll(map);
}

export default { rememberOrderToken, orderToken, forgetOrderToken };
