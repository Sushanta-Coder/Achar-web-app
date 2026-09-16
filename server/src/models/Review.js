import mongoose from 'mongoose';
import { REVIEW_STATUS, REVIEW_STATUS_VALUES } from '../utils/constants.js';

const reviewSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /**
     * The delivered order that entitles this customer to review the product.
     * Null only when the shop has turned off `requireDeliveredOrderForReview`,
     * in which case `isVerifiedPurchase` is false and the badge is not shown.
     */
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },

    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, maxlength: 120 },
    comment: { type: String, required: true, trim: true, minlength: 4, maxlength: 1500 },
    images: [{ url: String, publicId: String, alt: String }],

    isVerifiedPurchase: { type: Boolean, default: true },
    /**
     * Reviews start as `pending`: nothing appears on the storefront until a
     * moderator approves it, which is what keeps fake reviews out.
     */
    status: {
      type: String,
      enum: REVIEW_STATUS_VALUES,
      default: REVIEW_STATUS.PENDING,
      index: true,
    },
    moderationNote: { type: String, maxlength: 300 },
    adminResponse: { type: String, maxlength: 800 },
    helpfulCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// One review per customer per product.
reviewSchema.index({ product: 1, user: 1 }, { unique: true });
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });
reviewSchema.index({ status: 1, createdAt: -1 });

export default mongoose.models.Review || mongoose.model('Review', reviewSchema);
