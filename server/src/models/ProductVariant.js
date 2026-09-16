import mongoose from 'mongoose';

/**
 * A purchasable size of a product (250g / 500g / 1kg).
 *
 * Modelled as an embedded subdocument rather than a separate collection: a jar of
 * pickle has a handful of sizes, they are always read together with the product,
 * and embedding lets stock reservation happen in a single atomic update against
 * one document - which is what makes overselling impossible even without a
 * transaction. `ProductVariant` therefore lives in its own module (so it is easy
 * to promote to a collection later) but is stored inside `Product.variants`.
 *
 * Stock invariant: `availableStock === stock - reservedStock`.
 * `availableStock` is stored rather than derived so that reservation can use a
 * conditional `updateOne` (`availableStock: { $gte: qty }`) as an atomic
 * compare-and-swap. See `services/inventoryService.js`.
 */
export const productVariantSchema = new mongoose.Schema(
  {
    size: { type: String, required: true, trim: true, maxlength: 24 },
    sizeNp: { type: String, trim: true, maxlength: 24 },
    weightGrams: { type: Number, required: true, min: 1 },
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },

    price: { type: Number, required: true, min: 0 },
    /** Sale price. Must be lower than `price`; enforced by a schema validator. */
    discountPrice: { type: Number, min: 0, default: null },

    /** Physical units on hand. */
    stock: { type: Number, required: true, min: 0, default: 0 },
    /** Units held for orders that are placed but not yet paid/confirmed. */
    reservedStock: { type: Number, min: 0, default: 0 },
    /** stock - reservedStock. What a customer can add to the cart right now. */
    availableStock: { type: Number, min: 0, default: 0 },
    lowStockThreshold: { type: Number, min: 0, default: 5 },

    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

productVariantSchema.virtual('effectivePrice').get(function effectivePrice() {
  return this.discountPrice && this.discountPrice < this.price ? this.discountPrice : this.price;
});

productVariantSchema.virtual('discountPercentage').get(function discountPercentage() {
  if (!this.discountPrice || this.discountPrice >= this.price) return 0;
  return Math.round(((this.price - this.discountPrice) / this.price) * 100);
});

productVariantSchema.virtual('inStock').get(function inStock() {
  return Boolean(this.isActive) && (this.availableStock ?? 0) > 0;
});

productVariantSchema.virtual('isLowStock').get(function isLowStock() {
  const available = this.availableStock ?? 0;
  return available > 0 && available <= (this.lowStockThreshold ?? 5);
});

export default productVariantSchema;
