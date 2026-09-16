import mongoose from 'mongoose';

/**
 * Immutable snapshot of one purchased line.
 *
 * Product names, prices and images are copied in at checkout so that an invoice
 * printed a year later still shows what the customer actually bought, even if the
 * product has since been renamed, repriced or deleted.
 */
export const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, required: true },

    name: { type: String, required: true },
    nameNp: String,
    slug: { type: String, required: true },
    sku: { type: String, required: true },
    image: { url: String, alt: String },

    size: { type: String, required: true },
    weightGrams: Number,

    /** Catalogue price before any product-level discount. */
    listPrice: { type: Number, required: true, min: 0 },
    /** What the customer was actually charged per unit. */
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

export default orderItemSchema;
