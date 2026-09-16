import mongoose from 'mongoose';
import { seoSchema } from './Category.js';
import { BLOG_CATEGORIES, BLOG_STATUS, BLOG_STATUS_VALUES } from '../utils/constants.js';

const blogPostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    titleNp: { type: String, trim: true, maxlength: 160 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    excerpt: { type: String, required: true, trim: true, maxlength: 320 },
    excerptNp: { type: String, trim: true, maxlength: 320 },
    /** Sanitised HTML - see utils/sanitize.js#sanitizeHtml. */
    content: { type: String, required: true },
    contentNp: { type: String },

    featuredImage: {
      url: { type: String, required: true },
      publicId: String,
      alt: { type: String, required: true, maxlength: 160 },
    },

    category: { type: String, enum: BLOG_CATEGORIES, required: true, index: true },
    tags: { type: [String], default: [] },

    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    authorName: { type: String, required: true, trim: true, maxlength: 120 },

    status: { type: String, enum: BLOG_STATUS_VALUES, default: BLOG_STATUS.DRAFT, index: true },
    publishedAt: { type: Date, default: null },
    readingMinutes: { type: Number, default: 3 },
    viewCount: { type: Number, default: 0 },

    seo: { type: seoSchema, default: () => ({}) },
  },
  { timestamps: true }
);

blogPostSchema.index({ status: 1, publishedAt: -1 });
blogPostSchema.index({ title: 'text', excerpt: 'text', tags: 'text' }, { default_language: 'none' });

/** No `next`: Mongoose 9 save hooks signal completion by returning. */
blogPostSchema.pre('save', function estimateReadingTime() {
  if (this.isModified('content')) {
    const words = String(this.content).replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length;
    this.readingMinutes = Math.max(1, Math.round(words / 200));
  }
  if (this.status === BLOG_STATUS.PUBLISHED && !this.publishedAt) this.publishedAt = new Date();
});

export default mongoose.models.BlogPost || mongoose.model('BlogPost', blogPostSchema);
