import mongoose from 'mongoose';
import { PROVINCE_NAMES } from '../utils/nepal.js';

/**
 * Configurable Nepal delivery pricing. Nothing about delivery cost is hardcoded:
 * the admin creates zones, and `deliveryService` resolves an address to a zone by
 * checking, in order, an exact district match, then a province match, then the
 * fallback zone flagged `isDefault`.
 *
 * `priority` breaks ties when two zones both match (lower number wins), which lets
 * an admin add a narrow "Kathmandu Valley" zone above a broad "Bagmati" zone.
 */
const deliveryZoneSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 90 },
    nameNp: { type: String, trim: true, maxlength: 90 },
    description: { type: String, trim: true, maxlength: 240 },

    provinces: [{ type: String, enum: PROVINCE_NAMES }],
    districts: [{ type: String, trim: true }],

    charge: { type: Number, required: true, min: 0 },
    /** Order subtotal at or above which delivery is free. 0 = never free. */
    freeDeliveryThreshold: { type: Number, default: 0, min: 0 },

    estimatedDays: {
      min: { type: Number, default: 1, min: 0 },
      max: { type: Number, default: 3, min: 0 },
    },

    codAvailable: { type: Boolean, default: true },
    codExtraCharge: { type: Number, default: 0, min: 0 },

    isActive: { type: Boolean, default: true, index: true },
    /** Exactly one zone should carry this flag; used when nothing else matches. */
    isDefault: { type: Boolean, default: false },
    priority: { type: Number, default: 100 },
  },
  { timestamps: true }
);

deliveryZoneSchema.index({ isActive: 1, priority: 1 });
deliveryZoneSchema.index({ districts: 1 });
deliveryZoneSchema.index({ provinces: 1 });

export default mongoose.models.DeliveryZone || mongoose.model('DeliveryZone', deliveryZoneSchema);
