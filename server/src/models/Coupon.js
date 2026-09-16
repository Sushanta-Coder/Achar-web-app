import mongoose from 'mongoose';
import { DISCOUNT_TYPES, DISCOUNT_TYPE_VALUES } from '../utils/constants.js';

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 24,
      match: [/^[A-Z0-9_-]+$/, 'Coupon codes may contain letters, numbers, hyphen and underscore'],
    },
    description: { type: String, trim: true, maxlength: 240 },

    discountType: { type: String, enum: DISCOUNT_TYPE_VALUES, required: true },
    /** Percent (1-90) when type is percentage, rupees when type is fixed. */
    discountValue: { type: Number, required: true, min: 1 },

    minOrderAmount: { type: Number, default: 0, min: 0 },
    /** Caps a percentage coupon. 0 or null means uncapped. */
    maxDiscountAmount: { type: Number, default: null, min: 0 },

    startsAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },

    /** Total redemptions allowed across all customers. 0 = unlimited. */
    usageLimit: { type: Number, default: 0, min: 0 },
    usedCount: { type: Number, default: 0, min: 0 },
    /** Redemptions allowed per customer. */
    perUserLimit: { type: Number, default: 1, min: 1 },

    /** Empty arrays mean "applies to the whole catalogue". */
    appliesTo: {
      categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
      products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    },
    firstOrderOnly: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

couponSchema.index({ expiresAt: 1 });

couponSchema.virtual('isExpired').get(function isExpired() {
  return this.expiresAt instanceof Date && this.expiresAt.getTime() < Date.now();
});

couponSchema.virtual('isExhausted').get(function isExhausted() {
  return this.usageLimit > 0 && this.usedCount >= this.usageLimit;
});

couponSchema.methods.computeDiscount = function computeDiscount(eligibleAmount) {
  if (this.discountType === DISCOUNT_TYPES.PERCENTAGE) {
    const raw = Math.floor((eligibleAmount * this.discountValue) / 100);
    return this.maxDiscountAmount ? Math.min(raw, this.maxDiscountAmount) : raw;
  }
  return Math.min(this.discountValue, eligibleAmount);
};

export default mongoose.models.Coupon || mongoose.model('Coupon', couponSchema);
