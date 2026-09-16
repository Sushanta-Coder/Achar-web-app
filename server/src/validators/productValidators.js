import { z } from 'zod';
import {
  objectId,
  optionalText,
  requiredText,
  rupees,
  seoInput,
  imageInput,
  boolish,
} from './common.js';
import { SPICE_LEVELS, SORT_OPTIONS, MAX_PAGE_SIZE } from '../utils/constants.js';

/** Catalogue read/write shapes for both the storefront and the admin. */

export const productListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(12),
  q: optionalText(120),
  search: optionalText(120),
  category: optionalText(140),
  subcategory: optionalText(80),
  sort: z.enum(Object.keys(SORT_OPTIONS)).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  rating: z.coerce.number().min(1).max(5).optional(),
  spiceLevel: optionalText(60),
  vegetarian: z.enum(['true', 'false']).optional(),
  featured: z.enum(['true', 'false']).optional(),
  bestSeller: z.enum(['true', 'false']).optional(),
  newArrival: z.enum(['true', 'false']).optional(),
  onSale: z.enum(['true', 'false']).optional(),
  inStock: z.enum(['true', 'false']).optional(),
  status: z.enum(['all', 'active', 'inactive']).optional(),
  // Anonymous funnel id, forwarded to the search analytics event. Declared here
  // because `validate` strips unknown query keys - without it the event would
  // arrive with no session and every search would look like a new visitor.
  sessionId: optionalText(64),
});

/**
 * A variant. `discountPrice` is checked against `price` here as well as in the model,
 * so the customer gets a field-level message instead of a generic 422.
 */
const variantInput = z
  .object({
    _id: objectId.optional(),
    size: requiredText(30, 'Size'),
    sizeNp: optionalText(30),
    weightGrams: z.coerce.number().int().min(1).max(50_000),
    sku: requiredText(40, 'SKU').transform((value) => value.toUpperCase()),
    price: rupees.refine((value) => value > 0, 'Price must be greater than zero'),
    discountPrice: z.union([rupees, z.null()]).optional(),
    stock: z.coerce.number().int().min(0).max(1_000_000).default(0),
    lowStockThreshold: z.coerce.number().int().min(0).max(1000).default(5),
    isActive: z.boolean().default(true),
    isDefault: z.boolean().default(false),
  })
  .refine((value) => !value.discountPrice || value.discountPrice < value.price, {
    message: 'Discounted price must be below the regular price',
    path: ['discountPrice'],
  });

const nutritionInput = z
  .object({
    servingSize: optionalText(40),
    calories: z.coerce.number().min(0).max(10_000).optional(),
    protein: z.coerce.number().min(0).max(1000).optional(),
    carbohydrates: z.coerce.number().min(0).max(1000).optional(),
    fat: z.coerce.number().min(0).max(1000).optional(),
    sodium: z.coerce.number().min(0).max(100_000).optional(),
  })
  .optional();

const productBase = {
  name: requiredText(140, 'Product name'),
  nameNp: optionalText(140),
  slug: optionalText(160),
  sku: requiredText(40, 'SKU').transform((value) => value.toUpperCase()),
  shortDescription: requiredText(220, 'Short description'),
  shortDescriptionNp: optionalText(220),
  description: requiredText(6000, 'Description'),
  descriptionNp: optionalText(6000),
  category: objectId,
  subcategory: optionalText(80),
  images: z.array(imageInput).min(1, 'Add at least one product image').max(10),
  thumbnail: optionalText(500),
  variants: z.array(variantInput).min(1, 'Add at least one size'),
  ingredients: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  ingredientsNp: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  nutrition: nutritionInput,
  allergens: z.array(z.string().trim().max(60)).max(20).default([]),
  shelfLife: optionalText(80),
  storageInstructions: optionalText(300),
  origin: optionalText(80),
  spiceLevel: z.enum(SPICE_LEVELS).default('medium'),
  isVegetarian: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  isBestSeller: z.boolean().default(false),
  isNewArrival: z.boolean().default(false),
  isActive: z.boolean().default(true),
  seo: seoInput,
  keywords: z.array(z.string().trim().max(60)).max(30).default([]),
};

export const createProductSchema = z
  .object(productBase)
  .refine(
    (value) => new Set(value.variants.map((variant) => variant.size.toLowerCase())).size === value.variants.length,
    { message: 'Each size can only be listed once', path: ['variants'] }
  );

/** Partial update: every field optional, but the same rules when present. */
export const updateProductSchema = z.object(productBase).partial();

export const productSlugParams = z.object({ slug: z.string().trim().min(1).max(160) });

export const stockUpdateSchema = z.object({
  variantId: objectId,
  stock: z.coerce.number().int().min(0).max(1_000_000),
});

export const bulkStatusSchema = z.object({
  ids: z.array(objectId).min(1, 'Select at least one product').max(200),
  isActive: z.boolean(),
});

export const suggestQuery = z.object({
  q: z.string().trim().max(120).default(''),
  sessionId: optionalText(64),
});

// --- Categories --------------------------------------------------------------

export const createCategorySchema = z.object({
  name: requiredText(80, 'Category name'),
  nameNp: optionalText(80),
  slug: optionalText(100),
  description: optionalText(600),
  descriptionNp: optionalText(600),
  image: imageInput.partial({ alt: true }).optional(),
  icon: optionalText(8),
  parent: z.union([objectId, z.null()]).optional(),
  order: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  seo: seoInput,
});

export const updateCategorySchema = createCategorySchema.partial();

export const categoryListQuery = z.object({
  featured: z.enum(['true', 'false']).optional(),
  includeInactive: boolish.optional(),
  tree: z.enum(['true', 'false']).optional(),
});

export default {
  productListQuery,
  createProductSchema,
  updateProductSchema,
  productSlugParams,
  stockUpdateSchema,
  bulkStatusSchema,
  suggestQuery,
  createCategorySchema,
  updateCategorySchema,
  categoryListQuery,
};
