import mongoose from 'mongoose';
import { NEPAL_MOBILE_REGEX, normalizePhone } from '../utils/nepal.js';
import { CONTACT_STATUS, CONTACT_STATUS_VALUES } from '../utils/constants.js';

const contactMessageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 160 },
    phone: {
      type: String,
      trim: true,
      set: (value) => (value ? normalizePhone(value) : undefined),
      match: [NEPAL_MOBILE_REGEX, 'Enter a valid Nepali mobile number'],
    },
    subject: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    status: {
      type: String,
      enum: CONTACT_STATUS_VALUES,
      default: CONTACT_STATUS.NEW,
      index: true,
    },
    adminNote: { type: String, maxlength: 1000 },
    /** Coarse metadata only - no fingerprinting, no third-party trackers. */
    source: { type: String, default: 'contact-form' },
  },
  { timestamps: true }
);

contactMessageSchema.index({ createdAt: -1 });

export default mongoose.models.ContactMessage ||
  mongoose.model('ContactMessage', contactMessageSchema);
