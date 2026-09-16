/**
 * Formatting helpers shared by the storefront and the admin dashboard.
 *
 * Two decisions worth stating:
 *
 *  - Money is always an integer number of rupees. The API stores and computes in whole
 *    NPR (there are no paisa amounts in Nepali retail pricing), so nothing here rounds
 *    or does floating-point arithmetic on a price. Formatting only.
 *
 *  - Dates are rendered in Nepal Time (UTC+05:45) explicitly rather than in the
 *    visitor's locale. An order placed at 11pm in Kathmandu must not show as the
 *    previous day to an admin travelling abroad, and the API's own reports are bucketed
 *    in Nepal Time - a mismatch would make the dashboard disagree with itself.
 */

export const NEPAL_TZ = 'Asia/Kathmandu';

const npr = new Intl.NumberFormat('en-NP', { maximumFractionDigits: 0 });

/** `2350` -> `Rs. 2,350`. */
export function formatPrice(amount, { withSymbol = true } = {}) {
  const value = Number.isFinite(Number(amount)) ? Math.round(Number(amount)) : 0;
  const digits = npr.format(value);
  return withSymbol ? `Rs. ${digits}` : digits;
}

/** For compact spaces: `Rs. 1.2k`, `Rs. 3.4L` (lakh, the unit Nepali reporting uses). */
export function formatPriceCompact(amount) {
  const value = Math.round(Number(amount) || 0);
  if (Math.abs(value) >= 100_000) return `Rs. ${(value / 100_000).toFixed(1)}L`;
  if (Math.abs(value) >= 1_000) return `Rs. ${(value / 1_000).toFixed(1)}k`;
  return `Rs. ${value}`;
}

export function formatNumber(value) {
  return npr.format(Number(value) || 0);
}

export function formatPercent(value, digits = 0) {
  return `${(Number(value) || 0).toFixed(digits)}%`;
}

// --- Dates -------------------------------------------------------------------

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: NEPAL_TZ,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: NEPAL_TZ,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: NEPAL_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

const parse = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export function formatDate(value, fallback = '—') {
  const date = parse(value);
  return date ? dateFmt.format(date) : fallback;
}

export function formatDateTime(value, fallback = '—') {
  const date = parse(value);
  return date ? dateTimeFmt.format(date) : fallback;
}

export function formatTime(value, fallback = '—') {
  const date = parse(value);
  return date ? timeFmt.format(date) : fallback;
}

/**
 * `just now`, `4 min ago`, `3 days ago`, then an absolute date past a week.
 * Relative time stops being useful once it is "23 days ago" - an admin scanning an
 * order list wants the date at that point.
 */
export function formatRelative(value) {
  const date = parse(value);
  if (!date) return '—';
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);

  if (seconds < 0) return formatDateTime(date);
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) {
    const hours = Math.round(seconds / 3600);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (seconds < 7 * 86_400) {
    const days = Math.round(seconds / 86_400);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  return formatDate(date);
}

/**
 * `YYYY-MM-DD` in Nepal Time, for `<input type="date">` and the API's `from`/`to`
 * query params. Built from the formatter's parts rather than `toISOString().slice(0,10)`
 * - the latter is UTC, and would name the wrong day for anything after 6:15pm NPT.
 */
export function toDateInputValue(value = new Date()) {
  const date = parse(value);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: NEPAL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return parts; // en-CA already yields YYYY-MM-DD
}

/** Days between now and a date, in whole days. Negative when the date has passed. */
export function daysUntil(value) {
  const date = parse(value);
  if (!date) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

// --- Text --------------------------------------------------------------------

/**
 * Picks the Nepali field when the visitor is reading Nepali and it has been filled in.
 * Falls back to English rather than showing an empty string - most products have a
 * Nepali name but not a Nepali long description.
 */
export function localised(doc, field, locale) {
  if (!doc) return '';
  if (locale === 'np') {
    const npField = `${field}Np`;
    if (doc[npField]) return doc[npField];
  }
  return doc[field] ?? '';
}

export function truncate(text, max = 120) {
  const value = String(text ?? '');
  if (value.length <= max) return value;
  return `${value.slice(0, max).trimEnd()}…`;
}

export function initials(name) {
  return String(name ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** `9812345678` -> `98-1234-5678`, the way Nepali numbers are written. */
export function formatPhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '').replace(/^977/, '');
  if (digits.length !== 10) return String(phone ?? '');
  return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
}

/** Flattens a saved address into the one-line form used in lists and confirmations. */
export function addressLine(address) {
  if (!address) return '';
  return [
    address.tole,
    address.street,
    address.municipality && `${address.municipality}${address.wardNo ? `-${address.wardNo}` : ''}`,
    address.district,
    address.province,
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * Discount percentage off a variant, or 0. Kept as a helper because the same
 * calculation appears on the card, the detail page and the cart line, and they must
 * agree with the `maxDiscountPercentage` the server derives.
 */
export function discountPercent(price, discountPrice) {
  if (!discountPrice || !price || discountPrice >= price) return 0;
  return Math.round(((price - discountPrice) / price) * 100);
}

/** The price a variant actually sells at. */
export function effectivePrice(variant) {
  if (!variant) return 0;
  const { price = 0, discountPrice } = variant;
  return discountPrice && discountPrice < price ? discountPrice : price;
}
