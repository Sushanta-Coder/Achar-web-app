import mongoose from 'mongoose';
import { NEPAL_MOBILE_REGEX, PROVINCE_NAMES, normalizePhone } from '../utils/nepal.js';

/**
 * Nepal delivery address. Reused as a subdocument by `User.addresses` (saved
 * addresses) and by `Order.shippingAddress` (an immutable snapshot taken at
 * checkout, so later edits to a saved address never rewrite delivery history).
 */
export const addressSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, maxlength: 40, default: 'Home' },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    phone: {
      type: String,
      required: true,
      trim: true,
      set: normalizePhone,
      match: [NEPAL_MOBILE_REGEX, 'Enter a valid Nepali mobile number (98/97/96 followed by 8 digits)'],
    },
    altPhone: { type: String, trim: true, set: (v) => (v ? normalizePhone(v) : undefined) },
    province: { type: String, required: true, trim: true, enum: PROVINCE_NAMES },
    district: { type: String, required: true, trim: true, maxlength: 60 },
    municipality: { type: String, required: true, trim: true, maxlength: 80 },
    wardNo: { type: Number, required: true, min: 1, max: 35 },
    tole: { type: String, required: true, trim: true, maxlength: 120 },
    street: { type: String, trim: true, maxlength: 160 },
    landmark: { type: String, trim: true, maxlength: 160 },
    deliveryInstructions: { type: String, trim: true, maxlength: 300 },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

/** Single-line address used on invoices and in the admin order list. */
addressSchema.virtual('formatted').get(function formatted() {
  return [
    this.tole,
    this.street,
    `Ward ${this.wardNo}`,
    this.municipality,
    this.district,
    this.province,
  ]
    .filter(Boolean)
    .join(', ');
});

addressSchema.set('toJSON', { virtuals: true });
addressSchema.set('toObject', { virtuals: true });

export default addressSchema;
