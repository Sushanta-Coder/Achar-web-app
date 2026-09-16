import mongoose from 'mongoose';

const seoSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, maxlength: 70 },
    description: { type: String, trim: true, maxlength: 180 },
    keywords: { type: [String], default: [] },
  },
  { _id: false }
);

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 90 },
    nameNp: { type: String, trim: true, maxlength: 90 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 1200 },
    descriptionNp: { type: String, trim: true, maxlength: 1200 },
    image: {
      url: String,
      publicId: String,
      alt: { type: String, maxlength: 160 },
    },
    /** Emoji or short label rendered in the category chips on mobile. */
    icon: { type: String, trim: true, maxlength: 8 },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    isFeatured: { type: Boolean, default: false, index: true },
    seo: { type: seoSchema, default: () => ({}) },
    productCount: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

categorySchema.index({ isActive: 1, order: 1, name: 1 });

categorySchema.virtual('children', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parent',
});

export { seoSchema };
export default mongoose.models.Category || mongoose.model('Category', categorySchema);
