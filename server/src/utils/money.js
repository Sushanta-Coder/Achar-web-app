import { CURRENCY_SYMBOL } from './constants.js';

/**
 * All money in this application is stored and calculated in whole Nepali rupees.
 * NPR has no practical sub-unit in retail e-commerce (paisa is not used at
 * checkout, and both Khalti and eSewa settle in paisa/rupee integers), so keeping
 * integers avoids float drift entirely.
 */

/** Rounds to a whole rupee. Half-up, which is what customers expect on an invoice. */
export function toRupees(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number);
}

/** Khalti expects amounts in paisa. */
export function rupeesToPaisa(rupees) {
  return toRupees(rupees) * 100;
}

export function paisaToRupees(paisa) {
  return Math.round(Number(paisa) / 100);
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/** Percentage discount, floored so the customer is never charged a fraction more. */
export function percentageOf(amount, percentage) {
  return Math.floor((toRupees(amount) * Number(percentage)) / 100);
}

export function discountPercentage(price, discountPrice) {
  if (!discountPrice || discountPrice >= price) return 0;
  return Math.round(((price - discountPrice) / price) * 100);
}

export function formatNpr(value) {
  const amount = toRupees(value);
  return `${CURRENCY_SYMBOL} ${amount.toLocaleString('en-IN')}`;
}

export default { toRupees, rupeesToPaisa, paisaToRupees, percentageOf, discountPercentage, formatNpr, clamp };
