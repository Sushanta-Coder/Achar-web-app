import { z } from 'zod';
import { email, password, nepaliPhone, optionalText, requiredText, addressInput, objectId } from './common.js';

/**
 * Auth request shapes.
 *
 * Login accepts an email *or* a phone number in one field, because that is how people
 * actually think about signing in to a Nepali storefront.
 */

export const registerSchema = z.object({
  name: requiredText(80, 'Your name'),
  email,
  phone: nepaliPhone.optional(),
  password,
  marketingOptIn: z.boolean().optional().default(false),
  // Posted by the client so a guest cart survives registration.
  cart: z
    .array(
      z.object({
        productId: objectId,
        variantId: objectId,
        quantity: z.coerce.number().int().min(1).max(20),
      })
    )
    .max(50)
    .optional(),
});

export const loginSchema = z.object({
  identifier: requiredText(160, 'Email or phone'),
  password: z.string().min(1, 'Enter your password').max(128),
  cart: registerSchema.shape.cart,
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  email,
  token: requiredText(200, 'Reset token'),
  password,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  password,
});

export const updateProfileSchema = z.object({
  name: requiredText(80, 'Your name').optional(),
  phone: nepaliPhone.optional(),
  marketingOptIn: z.boolean().optional(),
  locale: z.enum(['en', 'np']).optional(),
});

export const addressSchema = addressInput;
export const addressParams = z.object({ addressId: objectId });

export const verifyEmailSchema = z.object({
  email,
  token: requiredText(200, 'Verification token'),
});

export const adminLoginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password').max(128),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Confirm with your password'),
  reason: optionalText(300),
});

/**
 * Live availability check on the signup form. Both fields are loose strings rather
 * than the strict `email` / `nepaliPhone` shapes: the field is being validated *as
 * the customer types*, and a half-typed address should come back "not yet taken",
 * not a 422 that the form has nowhere sensible to display.
 */
export const availabilityQuery = z
  .object({
    email: optionalText(160),
    phone: optionalText(20),
  })
  .refine((value) => value.email || value.phone, { message: 'Nothing to check' });

export default {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
  addressSchema,
  addressParams,
  verifyEmailSchema,
  adminLoginSchema,
  deleteAccountSchema,
  availabilityQuery,
};
