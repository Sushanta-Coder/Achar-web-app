import mongoose from 'mongoose';

const subscriberSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 160 },
    name: { type: String, trim: true, maxlength: 120 },
    isActive: { type: Boolean, default: true, index: true },
    source: { type: String, default: 'footer' },
    unsubscribedAt: Date,
  },
  { timestamps: true }
);

export default mongoose.models.Subscriber || mongoose.model('Subscriber', subscriberSchema);
