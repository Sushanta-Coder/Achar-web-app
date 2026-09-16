import crypto from 'node:crypto';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';

/**
 * Guest order access.
 *
 * Order numbers are sequential and human-readable (ACH-2026-000123), which is what
 * makes them useful on the phone - and exactly why they must not be enough on their
 * own to read an order. A signed-in customer is matched on `user`; a guest presents
 * this token, an HMAC over the order number and its creation time.
 *
 * Stateless on purpose: no extra field on the order, nothing to migrate, and
 * revocation is not needed because the token is scoped to a single order that
 * becomes read-only once delivered.
 */

const TOKEN_BYTES = 16;

export function orderAccessToken(order) {
  return crypto
    .createHmac('sha256', env.jwt.secret)
    .update(`${order.orderNumber}|${new Date(order.createdAt).getTime()}`)
    .digest('hex')
    .slice(0, TOKEN_BYTES * 2);
}

export function isValidOrderAccessToken(order, token) {
  if (!token) return false;
  const expected = Buffer.from(orderAccessToken(order));
  const provided = Buffer.from(String(token));
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(expected, provided);
}

/**
 * The single authorisation rule for reading one order.
 *
 * @param {object} order
 * @param {object|null} user   `req.user`, if signed in
 * @param {string} [token]     guest access token from the query string
 */
export function assertCanViewOrder(order, user, token) {
  if (user?.isStaff?.()) return;
  if (user && order.user && String(order.user) === String(user._id)) return;
  if (isValidOrderAccessToken(order, token)) return;
  throw ApiError.forbidden('You do not have access to this order');
}

export default { orderAccessToken, isValidOrderAccessToken, assertCanViewOrder };
