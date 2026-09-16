import mongoose from 'mongoose';

/**
 * One row per successful coupon redemption. Kept out of the Coupon document so a
 * popular code does not grow an unbounded array, and so the per-user limit can be
 * enforced with an indexed count instead of an array scan.
 */
const couponRedemptionSchema = new mongoose.Schema(
  {
    coupon: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', required: true, index: true },
    code: { type: String, required: true, uppercase: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    /** Guests are rate-limited by email instead of user id. */
    email: { type: String, lowercase: true, trim: true, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    discountAmount: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

// A single order can only redeem a given coupon once.
couponRedemptionSchema.index({ coupon: 1, order: 1 }, { unique: true });

export default mongoose.models.CouponRedemption ||
  mongoose.model('CouponRedemption', couponRedemptionSchema);
