import slugifyLib from 'slugify';

const OPTIONS = { lower: true, strict: true, trim: true, locale: 'en' };

/**
 * Builds a URL slug. Devanagari input is transliterated poorly by every slug
 * library, so when the result would be empty we fall back to the provided
 * `fallback` (usually a transliterated English name or the SKU) rather than
 * producing an empty or numeric slug.
 */
export function slugify(value, fallback = '') {
  const slug = slugifyLib(String(value ?? ''), OPTIONS);
  if (slug) return slug;
  return slugifyLib(String(fallback), OPTIONS);
}

/**
 * Ensures uniqueness by appending -2, -3 ... The `exists` callback receives a
 * candidate slug and resolves to true when it is already taken.
 */
export async function uniqueSlug(base, exists, { maxAttempts = 50 } = {}) {
  const root = base || 'item';
  let candidate = root;
  let suffix = 1;
  // Sequential on purpose: each probe depends on the previous candidate being taken,
  // and `exists` is a database round trip. Parallelising this would mean guessing
  // suffixes and then having to reconcile collisions.
  while (await exists(candidate)) {
    suffix += 1;
    candidate = `${root}-${suffix}`;
    if (suffix > maxAttempts) {
      candidate = `${root}-${Date.now().toString(36)}`;
      break;
    }
  }
  return candidate;
}

export default slugify;
