import { z } from 'zod';
import { PROVINCE_NAMES, districtsOf, NEPAL_MOBILE_REGEX } from '../utils/nepal.js';
import { MAX_PAGE_SIZE } from '../utils/constants.js';

/**
 * Shared validation primitives.
 *
 * Two rules keep the rest of the validators short:
 *   - anything arriving as a string from a query string is coerced here, so
 *     controllers never call parseInt
 *   - every user-visible message is written for the customer, not the developer,
 *     because these strings are rendered directly under form fields
 */

export const objectId = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid identifier');

export const slug = z
  .string()
  .trim()
  .min(1)
  .max(140)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid URL slug');

export const email = z.email('Enter a valid email address').trim().toLowerCase().max(160);

export const nepaliPhone = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/g, '').replace(/^977/, '').replace(/^0/, ''))
  .refine((value) => NEPAL_MOBILE_REGEX.test(value), 'Enter a valid Nepali mobile number (98XXXXXXXX)');

/**
 * The passwords that actually get tried in a credential-stuffing run. NIST 800-63B
 * pairs its "length, not composition" guidance with exactly this: a blocklist of
 * known-common choices. Without it `password` and `12345678` both clear an 8
 * character minimum, and those two alone account for a large share of real attempts.
 *
 * Compared case-insensitively and with trailing digits kept, so `Password1` is caught
 * by the base entry while a genuinely long passphrase is never touched.
 */
const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', 'password', 'password1', 'password123',
  'qwerty123', 'qwertyui', 'iloveyou', 'princess', 'sunshine', 'football',
  'baseball', 'welcome1', 'admin123', 'letmein1', 'monkey123', 'abc12345',
  'nepal123', 'kathmandu', 'namaste123', 'achar123',
]);

/**
 * Deliberately checks length and a common-password blocklist, and nothing else.
 * Composition rules ("one symbol, one digit") push people towards `Password1!`;
 * length is the property that actually matters, and the client shows a strength
 * meter to encourage more.
 */
export const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'That password is too long')
  .refine(
    (value) => !COMMON_PASSWORDS.has(value.toLowerCase()),
    'That password is too common - please choose something harder to guess'
  );

export const optionalText = (max) => z.string().trim().max(max).optional().or(z.literal(''));

export const requiredText = (max, label = 'This field') =>
  z.string().trim().min(1, `${label} is required`).max(max);

/** Whole-rupee money. Floats are rejected outright rather than silently rounded. */
export const rupees = z
  .coerce.number()
  .int('Amount must be a whole number of rupees')
  .min(0, 'Amount cannot be negative')
  .max(10_000_000);

export const quantity = z.coerce.number().int().min(1, 'Quantity must be at least 1').max(20);

export const boolish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(12),
});

export const seoInput = z
  .object({
    title: optionalText(70),
    description: optionalText(180),
    keywords: z.array(z.string().trim().max(60)).max(20).optional(),
  })
  .optional();

export const imageInput = z.object({
  url: z.url('Image URL is not valid'),
  publicId: optionalText(200),
  // Required, not optional: an image without alt text is an accessibility and SEO bug.
  alt: requiredText(160, 'Image alt text'),
});

/**
 * A Nepali delivery address. The district is checked against the province it was
 * submitted with, so "Bagmati / Pokhara" is rejected rather than quietly accepted and
 * then handed to a courier.
 */
export const addressInput = z
  .object({
    label: optionalText(30),
    fullName: requiredText(80, 'Full name'),
    phone: nepaliPhone,
    altPhone: z
      .string()
      .trim()
      .transform((value) => value.replace(/\D/g, '').replace(/^977/, '').replace(/^0/, ''))
      .refine((value) => !value || NEPAL_MOBILE_REGEX.test(value), 'Enter a valid mobile number')
      .optional()
      .or(z.literal('')),
    province: z.enum(PROVINCE_NAMES, { message: 'Select a province' }),
    district: requiredText(60, 'District'),
    municipality: requiredText(80, 'Municipality / VDC'),
    wardNo: z.coerce.number().int().min(1, 'Ward number is required').max(35),
    tole: requiredText(120, 'Tole / area'),
    street: optionalText(120),
    landmark: optionalText(160),
    deliveryInstructions: optionalText(300),
    isDefault: z.boolean().optional(),
  })
  .refine((value) => districtBelongsTo(value.province, value.district), {
    message: 'That district is not in the selected province',
    path: ['district'],
  });

/** Cross-field check: the district must actually sit inside the chosen province. */
const districtBelongsTo = (province, district) =>
  districtsOf(province).some((name) => name.toLowerCase() === String(district).toLowerCase());

export const idParams = z.object({ id: objectId });
export const productIdParams = z.object({ productId: objectId });
export const slugParams = z.object({ slug: z.string().trim().min(1).max(160) });

export default {
  objectId,
  slug,
  email,
  nepaliPhone,
  password,
  rupees,
  quantity,
  boolish,
  paginationQuery,
  seoInput,
  imageInput,
  addressInput,
  idParams,
  productIdParams,
  slugParams,
};
