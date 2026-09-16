import mongoose from 'mongoose';
import { BANNER_POSITIONS } from '../utils/constants.js';

/**
 * Admin-managed promotional imagery. Separate desktop and mobile artwork keeps
 * the mobile payload small instead of shipping a 1920px hero to a 375px screen.
 */
const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    titleNp: { type: String, trim: true, maxlength: 120 },
    subtitle: { type: String, trim: true, maxlength: 240 },
    subtitleNp: { type: String, trim: true, maxlength: 240 },

    image: {
      desktop: { url: { type: String, required: true }, publicId: String },
      mobile: { url: String, publicId: String },
      alt: { type: String, required: true, maxlength: 160 },
    },

    link: { type: String, trim: true, default: '/shop' },
    ctaLabel: { type: String, trim: true, maxlength: 40, default: 'Shop Now' },

    position: { type: String, enum: BANNER_POSITIONS, default: 'hero', index: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
  },
  { timestamps: true }
);

bannerSchema.index({ position: 1, isActive: 1, order: 1 });

/** True when the banner should be visible right now. */
bannerSchema.methods.isLive = function isLive(now = new Date()) {
  if (!this.isActive) return false;
  if (this.startsAt && this.startsAt > now) return false;
  if (this.endsAt && this.endsAt < now) return false;
  return true;
};

export default mongoose.models.Banner || mongoose.model('Banner', bannerSchema);
