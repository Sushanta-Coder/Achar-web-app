import mongoose from 'mongoose';
import { productVariantSchema } from './ProductVariant.js';
import { seoSchema } from './Category.js';
import { SPICE_LEVELS } from '../utils/constants.js';

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: String,
    /** Meaningful alt text is required - it is both an a11y and an SEO signal. */
    alt: { type: String, required: true, trim: true, maxlength: 160 },
    width: Number,
    height: Number,
  },
  { _id: false }
);

const nutritionSchema = new mongoose.Schema(
  {
    servingSize: { type: String, trim: true, default: '15 g' },
    calories: Number,
    protein: Number,
    carbohydrates: Number,
    sugar: Number,
    fat: Number,
    sodium: Number,
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Product name is required'], trim: true, maxlength: 140 },
    nameNp: { type: String, trim: true, maxlength: 140 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    /** Product-level SKU. Each variant additionally carries its own SKU. */
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 40 },

    shortDescription: { type: String, required: true, trim: true, maxlength: 300 },
    shortDescriptionNp: { type: String, trim: true, maxlength: 300 },
    description: { type: String, required: true, trim: true, maxlength: 6000 },
    descriptionNp: { type: String, trim: true, maxlength: 6000 },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true,
    },
    subcategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },

    images: {
      type: [imageSchema],
      validate: {
        validator: (value) => value.length > 0,
        message: 'At least one product image is required',
      },
    },
    thumbnail: { type: imageSchema, required: false },

    variants: {
      type: [productVariantSchema],
      validate: {
        validator: (value) => value.length > 0,
        message: 'At least one size/variant is required',
      },
    },

    /** Denormalised from `variants` on save so price sorting/filtering stays indexable. */
    minPrice: { type: Number, default: 0, index: true },
    maxPrice: { type: Number, default: 0 },
    totalStock: { type: Number, default: 0 },
    maxDiscountPercentage: { type: Number, default: 0 },

    ingredients: { type: [String], default: [] },
    ingredientsNp: { type: [String], default: [] },
    nutrition: { type: nutritionSchema, default: () => ({}) },
    allergens: { type: [String], default: [] },
    shelfLife: { type: String, trim: true, maxlength: 120 },
    storageInstructions: { type: String, trim: true, maxlength: 400 },
    origin: { type: String, trim: true, maxlength: 120, default: 'Nepal' },
    spiceLevel: { type: String, enum: SPICE_LEVELS, default: 'medium' },
    isVegetarian: { type: Boolean, default: true },

    isFeatured: { type: Boolean, default: false, index: true },
    isBestSeller: { type: Boolean, default: false, index: true },
    isNewArrival: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },

    seo: { type: seoSchema, default: () => ({}) },
    /** Extra search terms, including Nepali spellings ("अचार", "achar"). */
    keywords: { type: [String], default: [] },

    ratingAverage: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// --- Indexes -----------------------------------------------------------------
// Variant SKUs must be globally unique; a unique multikey index enforces that
// both within a document and across the collection.
productSchema.index({ 'variants.sku': 1 }, { unique: true, sparse: true });
productSchema.index({ isActive: 1, category: 1, minPrice: 1 });
productSchema.index({ isActive: 1, createdAt: -1 });
productSchema.index({ isActive: 1, totalStock: -1 });
productSchema.index({ isActive: 1, soldCount: -1 });
productSchema.index({ isActive: 1, ratingAverage: -1 });
productSchema.index(
  { name: 'text', nameNp: 'text', keywords: 'text', shortDescription: 'text' },
  {
    name: 'product_search',
    weights: { name: 10, nameNp: 10, keywords: 6, shortDescription: 2 },
    // 'none' disables stemming and stop-word removal, which keeps Devanagari
    // tokens intact instead of running them through the English analyser.
    default_language: 'none',
  }
);

// --- Derived fields ----------------------------------------------------------
productSchema.path('variants').validate(function validateVariantPricing(variants) {
  return (variants ?? []).every(
    (variant) => variant.discountPrice == null || variant.discountPrice < variant.price
  );
}, 'Each variant discount price must be lower than its regular price');

productSchema.path('variants').validate(function validateUniqueSizes(variants) {
  const sizes = (variants ?? []).map((v) => String(v.size).toLowerCase());
  return new Set(sizes).size === sizes.length;
}, 'Variant sizes must be unique within a product');

/**
 * Mongoose 9 no longer passes a `next` callback to `save` hooks - returning (or
 * resolving) is the only signal. A hook written the old way throws
 * "next is not a function" on every single save.
 */
productSchema.pre('save', function syncDerivedFields() {
  // Re-establish the stock invariant. Inventory transitions use updateOne() and
  // bypass this hook, so it only ever runs for admin/seed edits.
  for (const variant of this.variants ?? []) {
    variant.reservedStock = Math.max(0, variant.reservedStock || 0);
    variant.availableStock = Math.max(0, (variant.stock || 0) - variant.reservedStock);
  }

  const active = (this.variants ?? []).filter((v) => v.isActive);
  const pool = active.length ? active : (this.variants ?? []);
  const prices = pool.map((v) => (v.discountPrice && v.discountPrice < v.price ? v.discountPrice : v.price));

  this.minPrice = prices.length ? Math.min(...prices) : 0;
  this.maxPrice = prices.length ? Math.max(...prices) : 0;
  this.totalStock = pool.reduce((sum, v) => sum + (v.availableStock || 0), 0);
  this.maxDiscountPercentage = pool.reduce((max, v) => {
    if (!v.discountPrice || v.discountPrice >= v.price) return max;
    return Math.max(max, Math.round(((v.price - v.discountPrice) / v.price) * 100));
  }, 0);

  if (!this.thumbnail?.url && this.images?.length) this.thumbnail = this.images[0];
  if (pool.length && !pool.some((v) => v.isDefault)) pool[0].isDefault = true;
});

productSchema.virtual('inStock').get(function inStock() {
  return (this.variants ?? []).some((v) => v.isActive && (v.availableStock || 0) > 0);
});

productSchema.virtual('defaultVariant').get(function defaultVariant() {
  const active = (this.variants ?? []).filter((v) => v.isActive);
  return active.find((v) => v.isDefault) || active[0] || null;
});

productSchema.virtual('reviews', {
  ref: 'Review',
  localField: '_id',
  foreignField: 'product',
});

/** Fields the storefront needs for a product card - keeps list payloads small. */
export const PRODUCT_CARD_FIELDS =
  'name nameNp slug sku thumbnail images minPrice maxPrice ' +
  'ratingAverage ratingCount soldCount isBestSeller isNewArrival isFeatured ' +
  'maxDiscountPercentage totalStock variants category shortDescription createdAt';

export default mongoose.models.Product || mongoose.model('Product', productSchema);
