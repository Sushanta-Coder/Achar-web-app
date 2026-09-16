import mongoose from 'mongoose';
import { MAX_QTY_PER_ITEM } from '../utils/constants.js';

/**
 * Server-side cart for signed-in customers. Guests keep the same shape in
 * localStorage and it is merged into this document on login.
 *
 * Deliberately stores only *references and quantities* - never prices. Every
 * total the customer sees is recalculated from the current product document by
 * `pricingService`, so a stale or tampered cart can never change what is charged.
 */
const cartItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    quantity: { type: Number, required: true, min: 1, max: MAX_QTY_PER_ITEM, default: 1 },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    items: { type: [cartItemSchema], default: [] },
    couponCode: { type: String, uppercase: true, trim: true, default: null },
  },
  { timestamps: true }
);

cartSchema.methods.findItem = function findItem(productId, variantId) {
  return this.items.find(
    (item) =>
      String(item.product) === String(productId) && String(item.variantId) === String(variantId)
  );
};

export default mongoose.models.Cart || mongoose.model('Cart', cartSchema);
