/**
 * Defence-in-depth input hygiene.
 *
 * Mongoose casting already blocks most NoSQL injection, but a query object such
 * as `{ email: { $ne: null } }` arriving through `req.query` would still be cast
 * successfully. Stripping `$`-prefixed keys and dotted paths from all request
 * input removes that class of attack outright.
 *
 * Implemented in-house rather than with express-mongo-sanitize because that
 * package mutates `req.query`, which is a getter-only property on Express 5.
 */

const FORBIDDEN_KEY = /^\$|\./;

function scrubValue(value, depth) {
  if (depth > 8) return undefined;
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1));
  if (value && typeof value === 'object' && value.constructor === Object) {
    const output = {};
    for (const [key, val] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(key)) continue;
      output[key] = scrubValue(val, depth + 1);
    }
    return output;
  }
  return value;
}

/** Removes operator-like keys from a plain object tree. */
export function scrub(input) {
  return scrubValue(input, 0);
}

export function sanitizeRequest(req, _res, next) {
  if (req.body && typeof req.body === 'object') req.body = scrub(req.body);
  if (req.params && typeof req.params === 'object') Object.assign(req.params, scrub(req.params));

  if (req.query && typeof req.query === 'object') {
    const cleaned = scrub(req.query);
    // req.query is a lazy getter on Express 5, so mutate in place instead of reassigning.
    for (const key of Object.keys(req.query)) {
      if (!(key in cleaned)) delete req.query[key];
    }
    Object.assign(req.query, cleaned);
  }
  next();
}

/** Drops ASCII control characters (written as a code check to keep the source ASCII-only). */
export function stripControlChars(value) {
  let output = '';
  for (const char of String(value)) {
    const code = char.codePointAt(0);
    if (code > 31 && code !== 127) output += char;
  }
  return output;
}

/**
 * Strips HTML tags and control characters from free-text fields that are later
 * rendered as text (names, addresses, review bodies). Rich-text blog content is
 * deliberately NOT passed through this - see `sanitizeHtml` below.
 */
export function stripTags(value) {
  if (typeof value !== 'string') return value;
  return stripControlChars(value.replace(/<\/?[^>]+(>|$)/g, '')).trim();
}

/**
 * Small allow-list HTML sanitizer for admin-authored blog content. Admins are
 * trusted, but a compromised staff account should not be able to inject a script
 * tag that then runs in every visitor's browser.
 */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's', 'ul', 'ol', 'li',
  'h2', 'h3', 'h4', 'blockquote', 'a', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'code', 'pre', 'hr', 'span',
]);

const BLOCKED_ELEMENTS = /^(script|style|iframe|object|embed|form|input|link|meta)$/;

export function sanitizeHtml(html) {
  if (typeof html !== 'string') return '';
  return html
    .replace(
      /<\s*(script|style|iframe|object|embed|form|input|link|meta)\b[\s\S]*?<\/\s*\1\s*>/gi,
      ''
    )
    .replace(/<\s*(script|style|iframe|object|embed|form|input|link|meta)\b[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"')
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, tag) => {
      const name = tag.toLowerCase();
      if (BLOCKED_ELEMENTS.test(name)) return '';
      return ALLOWED_TAGS.has(name) ? match : '';
    });
}

export default sanitizeRequest;
