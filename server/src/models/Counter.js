import mongoose from 'mongoose';

/**
 * Atomic sequence generator. Used for human-readable order numbers
 * (ACH-2026-000123) which must never collide, even under concurrent checkouts.
 */
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    sequence: { type: Number, default: 0 },
  },
  { versionKey: false }
);

counterSchema.statics.next = async function next(key, session) {
  const doc = await this.findByIdAndUpdate(
    key,
    { $inc: { sequence: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true, ...(session ? { session } : {}) }
  );
  return doc.sequence;
};

export default mongoose.models.Counter || mongoose.model('Counter', counterSchema);
