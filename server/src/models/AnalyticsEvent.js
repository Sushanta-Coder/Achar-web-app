import mongoose from 'mongoose';

export const ANALYTICS_EVENTS = [
  'product_view',
  'add_to_cart',
  'remove_from_cart',
  'checkout_started',
  'payment_initiated',
  'purchase_completed',
  'search',
  'coupon_applied',
  'newsletter_signup',
];

/**
 * First-party, privacy-light funnel analytics.
 *
 * Stores an anonymous rotating session id rather than an IP address or device
 * fingerprint, and expires automatically after 90 days via a TTL index. This
 * exists so the funnel is measurable without adding a third-party tracker to the
 * critical rendering path; GA4 or Plausible can be layered on later by pointing
 * `analyticsService` at them.
 */
const analyticsEventSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ANALYTICS_EVENTS, required: true, index: true },
    sessionId: { type: String, required: true, maxlength: 64, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    /** Small, non-identifying payload: search term, coupon code, value, path. */
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

analyticsEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
analyticsEventSchema.index({ type: 1, createdAt: -1 });

export default mongoose.models.AnalyticsEvent ||
  mongoose.model('AnalyticsEvent', analyticsEventSchema);
