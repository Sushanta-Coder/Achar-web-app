/**
 * Nepal Time (NPT) helpers.
 *
 * Nepal is UTC+05:45 and has no daylight saving, so a fixed offset is exact - no
 * timezone database needed.
 *
 * These exist because dashboard figures must be bucketed by the *shop's* day, not
 * the server's. A host in UTC (the default on Render, Railway and most VPS images)
 * would otherwise start "today" at 05:45 Kathmandu time, so every order placed
 * early in the morning would be reported against the previous day - and "This
 * month" would miss the first 5h45m of the 1st entirely.
 *
 * Mongo aggregations pass `NEPAL_TZ` to `$dateToString`; the JavaScript side uses
 * `npt()` to read the same wall-clock parts. Both must agree or a gap-filled chart
 * silently drops real revenue into a bucket the axis never draws.
 */

/** `$dateToString`-compatible offset string. */
export const NEPAL_TZ = '+05:45';

export const NEPAL_OFFSET_MINUTES = 5 * 60 + 45;
const OFFSET_MS = NEPAL_OFFSET_MINUTES * 60_000;

/**
 * Shifts an instant so the UTC getters read Nepal wall-clock parts.
 * The result is only for reading fields - never store it or send it as an instant.
 */
const npt = (date) => new Date(new Date(date).getTime() + OFFSET_MS);

/** Turns Nepal wall-clock parts back into a real UTC instant. */
const fromNptParts = (year, month, day, hour = 0, minute = 0, second = 0, ms = 0) =>
  new Date(Date.UTC(year, month, day, hour, minute, second, ms) - OFFSET_MS);

const pad = (value) => String(value).padStart(2, '0');

// --- Boundaries ---------------------------------------------------------------

/** Midnight in Kathmandu, as a UTC instant suitable for a Mongo range query. */
export function startOfNepalDay(date = new Date()) {
  const local = npt(date);
  return fromNptParts(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
}

export function endOfNepalDay(date = new Date()) {
  const local = npt(date);
  return fromNptParts(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    23,
    59,
    59,
    999
  );
}

export function startOfNepalMonth(date = new Date()) {
  const local = npt(date);
  return fromNptParts(local.getUTCFullYear(), local.getUTCMonth(), 1);
}

/** `n` whole Nepali days back, starting at midnight. */
export const nepalDaysAgo = (days, from = new Date()) =>
  startOfNepalDay(new Date(from.getTime() - days * 86_400_000));

/** Same month arithmetic, done on Nepal parts so it never lands on the wrong day. */
export function addNepalMonths(months, from = new Date()) {
  const local = npt(from);
  return fromNptParts(local.getUTCFullYear(), local.getUTCMonth() + months, 1);
}

// --- Bucket keys --------------------------------------------------------------

/** `2026-09-02` - matches `$dateToString` with `%Y-%m-%d` and `NEPAL_TZ`. */
export function nepalDateKey(date) {
  const local = npt(date);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
}

/** `2026-09` - matches `%Y-%m`. */
export function nepalMonthKey(date) {
  const local = npt(date);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}`;
}

/** `2026-W36` - ISO-8601 week, matching Mongo's `%G-W%V`. */
export function nepalWeekKey(date) {
  const local = npt(date);
  // Thursday of the same ISO week determines the week-numbering year.
  const thursday = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
  );
  const dayNumber = thursday.getUTCDay() || 7;
  thursday.setUTCDate(thursday.getUTCDate() + 4 - dayNumber);

  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((thursday.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${pad(week)}`;
}

/** Human-facing date for emails, invoices and CSV columns. */
export function formatNepalDate(date, { withTime = false } = {}) {
  if (!date) return '';
  const local = npt(date);
  const day = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
  if (!withTime) return day;
  return `${day} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

export default {
  NEPAL_TZ,
  NEPAL_OFFSET_MINUTES,
  startOfNepalDay,
  endOfNepalDay,
  startOfNepalMonth,
  nepalDaysAgo,
  addNepalMonths,
  nepalDateKey,
  nepalMonthKey,
  nepalWeekKey,
  formatNepalDate,
};
