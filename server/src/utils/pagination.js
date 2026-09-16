import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants.js';

/** Normalises `?page=` / `?limit=` into safe integers with a hard upper bound. */
export function parsePagination(query = {}, { defaultLimit = DEFAULT_PAGE_SIZE } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const requested = Number.parseInt(query.limit, 10) || defaultLimit;
  const limit = Math.min(Math.max(1, requested), MAX_PAGE_SIZE);
  return { page, limit, skip: (page - 1) * limit };
}

/** Escapes a user-supplied string so it can be used inside a RegExp safely. */
export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default parsePagination;
