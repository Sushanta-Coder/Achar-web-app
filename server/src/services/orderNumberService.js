import Counter from '../models/Counter.js';

/**
 * Human-readable order numbers: ACH-2026-000123
 *
 * Backed by an atomic counter per year, so numbers are gapless, sortable, easy to
 * read out over the phone, and never collide under concurrent checkouts. The
 * sequence is intentionally *not* the Mongo _id, which stays the internal key.
 */
const PREFIX = 'ACH';

export async function nextOrderNumber(session, now = new Date()) {
  const year = now.getFullYear();
  const sequence = await Counter.next(`order:${year}`, session);
  return `${PREFIX}-${year}-${String(sequence).padStart(6, '0')}`;
}

export function isOrderNumber(value) {
  return /^ACH-\d{4}-\d{6}$/.test(String(value ?? '').trim().toUpperCase());
}

/** Payment references sent to gateways: ACH-2026-000123-1 (order number + attempt). */
export function paymentReference(orderNumber, attempt = 1) {
  return `${orderNumber}-${attempt}`;
}

export function orderNumberFromReference(reference) {
  const match = /^(ACH-\d{4}-\d{6})/.exec(String(reference ?? '').trim().toUpperCase());
  return match ? match[1] : null;
}

export default { nextOrderNumber, isOrderNumber, paymentReference, orderNumberFromReference };
