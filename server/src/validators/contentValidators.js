import { z } from 'zod';
import { objectId, optionalText, requiredText, rupees, imageInput, nepaliPhone } from './common.js';
import { PROVINCE_NAMES } from '../utils/nepal.js';
import {
  BANNER_POSITIONS,
  BLOG_CATEGORIES,
  BLOG_STATUS_VALUES,
  CONTACT_STATUS_VALUES,
  DISCOUNT_TYPE_VALUES,
  ORDER_STATUS_VALUES,
  REVIEW_STATUS_VALUES,
  STAFF_ROLES,
} from '../utils/constants.js';

/** Coupons, reviews, blog, banners, delivery zones, settings and the small forms. */

/** Accepts either a full ISO timestamp or a plain `YYYY-MM-DD` from a date input. */
const dateish = z.union([z.iso.datetime({ offset: true }), z.iso.datetime(), z.iso.date()]);
const nullableDateish = z.union([dateish, z.null()]);

// --- Coupons -----------------------------------------------------------------

export const couponCode = requiredText(30, 'Coupon code')
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z0-9_-]+$/.test(value), 'Use letters, numbers, dashes or underscores only');

export const createCouponSchema = z
  .object({
    code: couponCode,
    description: optionalText(200),
    discountType: z.enum(DISCOUNT_TYPE_VALUES),
    discountValue: z.coerce.number().min(1, 'Enter a discount value'),
    minOrderAmount: rupees.default(0),
    maxDiscountAmount: rupees.default(0),
    startsAt: dateish.optional(),
    expiresAt: dateish.optional(),
    usageLimit: z.coerce.number().int().min(0).max(1_000_000).default(0),
    perUserLimit: z.coerce.number().int().min(0).max(100).default(1),
    appliesTo: z
      .object({
        categories: z.array(objectId).max(50).default([]),
        products: z.array(objectId).max(200).default([]),
      })
      .optional(),
    firstOrderOnly: z.boolean().default(false),
    isActive: z.boolean().default(true),
  })
  .refine(
    (value) => value.discountType !== 'percentage' || value.discountValue <= 100,
    { message: 'A percentage discount cannot exceed 100', path: ['discountValue'] }
  )
  .refine(
    (value) => !value.startsAt || !value.expiresAt || new Date(value.expiresAt) > new Date(value.startsAt),
    { message: 'The end date must be after the start date', path: ['expiresAt'] }
  );

export const updateCouponSchema = z.object({
  description: optionalText(200),
  discountType: z.enum(DISCOUNT_TYPE_VALUES).optional(),
  discountValue: z.coerce.number().min(1).optional(),
  minOrderAmount: rupees.optional(),
  maxDiscountAmount: rupees.optional(),
  startsAt: nullableDateish.optional(),
  expiresAt: nullableDateish.optional(),
  usageLimit: z.coerce.number().int().min(0).optional(),
  perUserLimit: z.coerce.number().int().min(0).optional(),
  firstOrderOnly: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const validateCouponSchema = z.object({
  code: couponCode,
  items: z
    .array(z.object({ productId: objectId, variantId: objectId, quantity: z.coerce.number().int().min(1) }))
    .optional(),
});

export const couponListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(20),
  q: optionalText(40),
  status: z.enum(['active', 'expired', 'scheduled', 'disabled']).optional(),
});

// --- Reviews -----------------------------------------------------------------

export const createReviewSchema = z.object({
  productId: objectId,
  orderId: objectId.optional(),
  rating: z.coerce.number().int().min(1, 'Choose a rating').max(5),
  title: optionalText(120),
  comment: requiredText(1500, 'Your review'),
  images: z.array(z.url()).max(4).default([]),
});

export const updateReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5).optional(),
  title: optionalText(120),
  comment: optionalText(1500),
});

export const moderateReviewSchema = z.object({
  status: z.enum(REVIEW_STATUS_VALUES),
  moderationNote: optionalText(300),
  adminResponse: optionalText(1000),
});

export const reviewListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  status: z.enum(REVIEW_STATUS_VALUES).optional(),
  sort: z.enum(['newest', 'helpful', 'rating-high', 'rating-low']).default('newest'),
});

// --- Blog --------------------------------------------------------------------

export const createBlogPostSchema = z.object({
  title: requiredText(160, 'Title'),
  titleNp: optionalText(160),
  slug: optionalText(180),
  excerpt: requiredText(300, 'Excerpt'),
  excerptNp: optionalText(300),
  content: requiredText(40_000, 'Content'),
  contentNp: optionalText(40_000),
  featuredImage: imageInput,
  category: z.enum(BLOG_CATEGORIES),
  tags: z.array(z.string().trim().max(40)).max(15).default([]),
  status: z.enum(BLOG_STATUS_VALUES).default('draft'),
  publishedAt: nullableDateish.optional(),
  seo: z
    .object({
      title: optionalText(70),
      description: optionalText(180),
      keywords: z.array(z.string().trim().max(60)).max(20).optional(),
    })
    .optional(),
});

export const updateBlogPostSchema = createBlogPostSchema.partial();

/**
 * Publish / unpublish. `keepPublishedAt` lets an admin pull a post back to draft
 * without losing its original publication date, so re-publishing does not push it
 * to the top of the blog as if it were new.
 */
export const blogStatusSchema = z.object({
  status: z.enum(BLOG_STATUS_VALUES),
  keepPublishedAt: z.boolean().optional(),
});

export const blogListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(24).default(9),
  category: z.enum(BLOG_CATEGORIES).optional(),
  tag: optionalText(40),
  q: optionalText(120),
  status: z.enum(BLOG_STATUS_VALUES).optional(),
});

// --- Banners -----------------------------------------------------------------

export const createBannerSchema = z.object({
  title: requiredText(120, 'Banner title'),
  titleNp: optionalText(120),
  subtitle: optionalText(200),
  subtitleNp: optionalText(200),
  image: z.object({
    desktop: z.object({ url: z.url('Desktop image URL is not valid'), publicId: optionalText(200) }),
    mobile: z
      .object({ url: z.url().optional().or(z.literal('')), publicId: optionalText(200) })
      .optional(),
    alt: requiredText(160, 'Image alt text'),
  }),
  link: optionalText(300),
  ctaLabel: optionalText(40),
  position: z.enum(BANNER_POSITIONS).default('hero'),
  order: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
  startsAt: nullableDateish.optional(),
  endsAt: nullableDateish.optional(),
});

export const updateBannerSchema = createBannerSchema.partial();

/**
 * Drag-and-drop reordering. The ids are scoped to a single position, so a
 * malformed payload can only ever rearrange one carousel.
 */
export const bannerReorderSchema = z.object({
  position: z.enum(BANNER_POSITIONS),
  ids: z.array(objectId).min(1, 'Nothing to reorder').max(50),
});

export const bannerListQuery = z.object({
  position: z.enum(BANNER_POSITIONS).optional(),
});

// --- Delivery zones ----------------------------------------------------------

export const createDeliveryZoneSchema = z
  .object({
    name: requiredText(80, 'Zone name'),
    nameNp: optionalText(80),
    description: optionalText(300),
    provinces: z.array(z.enum(PROVINCE_NAMES)).max(7).default([]),
    districts: z.array(z.string().trim().max(60)).max(77).default([]),
    charge: rupees,
    freeDeliveryThreshold: rupees.default(0),
    estimatedDays: z
      .object({
        min: z.coerce.number().int().min(0).max(60).default(1),
        max: z.coerce.number().int().min(0).max(60).default(3),
      })
      .refine((value) => value.max >= value.min, {
        message: 'The maximum must be at least the minimum',
        path: ['max'],
      }),
    codAvailable: z.boolean().default(true),
    codExtraCharge: rupees.default(0),
    isActive: z.boolean().default(true),
    isDefault: z.boolean().default(false),
    priority: z.coerce.number().int().min(0).max(999).default(100),
  })
  .refine(
    (value) => value.isDefault || value.provinces.length > 0 || value.districts.length > 0,
    { message: 'Select at least one province or district, or mark this as the fallback zone', path: ['districts'] }
  );

export const updateDeliveryZoneSchema = z.object({
  name: optionalText(80),
  nameNp: optionalText(80),
  description: optionalText(300),
  provinces: z.array(z.enum(PROVINCE_NAMES)).max(7).optional(),
  districts: z.array(z.string().trim().max(60)).max(77).optional(),
  charge: rupees.optional(),
  freeDeliveryThreshold: rupees.optional(),
  estimatedDays: z
    .object({
      min: z.coerce.number().int().min(0).max(60),
      max: z.coerce.number().int().min(0).max(60),
    })
    .refine((value) => value.max >= value.min, {
      message: 'The maximum must be at least the minimum',
      path: ['max'],
    })
    .optional(),
  codAvailable: z.boolean().optional(),
  codExtraCharge: rupees.optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  priority: z.coerce.number().int().min(0).max(999).optional(),
});

/**
 * The "do you deliver to me?" widget. A loose string rather than an enum of the 77
 * districts: an unrecognised name is a real answer here ("we don't know that
 * district"), not a validation failure, and the controller renders it as such.
 */
export const districtCheckQuery = z.object({
  district: requiredText(60, 'District'),
});

// --- Site settings -----------------------------------------------------------

const ctaInput = z.object({ label: optionalText(40), link: optionalText(200) }).optional();

/**
 * Settings updates are validated section by section and merged server-side, so the
 * admin UI can PATCH just the block it is editing without resending the whole
 * document (and without being able to introduce keys the schema does not have).
 */
export const updateSettingsSchema = z.object({
  company: z
    .object({
      name: optionalText(90),
      nameNp: optionalText(90),
      tagline: optionalText(160),
      taglineNp: optionalText(160),
      legalName: optionalText(120),
      panNumber: optionalText(30),
      logoUrl: optionalText(500),
      faviconUrl: optionalText(500),
      email: optionalText(160),
      supportEmail: optionalText(160),
      phone: optionalText(20),
      whatsapp: optionalText(20),
      landline: optionalText(20),
      address: z
        .object({
          street: optionalText(120),
          municipality: optionalText(90),
          wardNo: z.coerce.number().int().min(1).max(35).optional(),
          district: optionalText(60),
          province: optionalText(60),
          country: optionalText(60),
          postalCode: optionalText(12),
        })
        .optional(),
      geo: z
        .object({ lat: z.coerce.number().min(26).max(31), lng: z.coerce.number().min(80).max(89) })
        .optional(),
      mapUrl: optionalText(600),
      openingHours: z.array(z.string().trim().max(60)).max(7).optional(),
      social: z
        .object({
          facebook: optionalText(300),
          instagram: optionalText(300),
          tiktok: optionalText(300),
          youtube: optionalText(300),
          twitter: optionalText(300),
        })
        .optional(),
    })
    .optional(),

  announcement: z
    .object({
      isActive: z.boolean().optional(),
      text: optionalText(200),
      textNp: optionalText(200),
      link: optionalText(200),
    })
    .optional(),

  homepage: z
    .object({
      hero: z
        .object({
          headline: optionalText(160),
          headlineNp: optionalText(160),
          subheadline: optionalText(320),
          subheadlineNp: optionalText(320),
          primaryCta: ctaInput,
          secondaryCta: ctaInput,
          imageUrl: optionalText(600),
          imageAlt: optionalText(200),
        })
        .optional(),
      whyChooseUs: z
        .array(
          z.object({
            icon: optionalText(8),
            title: requiredText(80, 'Feature title'),
            titleNp: optionalText(80),
            description: requiredText(240, 'Feature description'),
            descriptionNp: optionalText(240),
          })
        )
        .max(8)
        .optional(),
      testimonials: z
        .array(
          z.object({
            name: requiredText(90, 'Name'),
            location: optionalText(90),
            rating: z.coerce.number().int().min(1).max(5).default(5),
            quote: requiredText(500, 'Quote'),
            avatarUrl: optionalText(500),
            isActive: z.boolean().default(true),
          })
        )
        .max(12)
        .optional(),
      promo: z
        .object({
          isActive: z.boolean().optional(),
          title: optionalText(120),
          subtitle: optionalText(200),
          ctaLabel: optionalText(40),
          link: optionalText(200),
          imageUrl: optionalText(600),
        })
        .optional(),
      showBlogSection: z.boolean().optional(),
      showTestimonials: z.boolean().optional(),
      showNewsletter: z.boolean().optional(),
      featuredCategoryLimit: z.coerce.number().int().min(1).max(20).optional(),
      bestSellerLimit: z.coerce.number().int().min(1).max(20).optional(),
      newArrivalLimit: z.coerce.number().int().min(1).max(20).optional(),
    })
    .optional(),

  seo: z
    .object({
      defaultTitle: optionalText(70),
      titleTemplate: optionalText(60),
      defaultDescription: optionalText(180),
      defaultKeywords: z.array(z.string().trim().max(60)).max(30).optional(),
      ogImageUrl: optionalText(600),
      twitterHandle: optionalText(40),
      googleSiteVerification: optionalText(120),
      indexable: z.boolean().optional(),
    })
    .optional(),

  commerce: z
    .object({
      taxRate: z.coerce.number().min(0).max(30).optional(),
      taxLabel: optionalText(20),
      pricesIncludeTax: z.boolean().optional(),
      freeDeliveryThreshold: rupees.optional(),
      minOrderAmount: rupees.optional(),
      allowGuestCheckout: z.boolean().optional(),
      requireDeliveredOrderForReview: z.boolean().optional(),
      autoApproveReviews: z.boolean().optional(),
    })
    .optional(),

  payments: z
    .object({
      khalti: z.object({ isEnabled: z.boolean().optional(), label: optionalText(40) }).optional(),
      esewa: z.object({ isEnabled: z.boolean().optional(), label: optionalText(40) }).optional(),
      cod: z
        .object({
          isEnabled: z.boolean().optional(),
          label: optionalText(40),
          maxOrderAmount: rupees.optional(),
        })
        .optional(),
    })
    .optional(),

  policies: z
    .object({
      shipping: optionalText(40_000),
      returns: optionalText(40_000),
      privacy: optionalText(40_000),
      terms: optionalText(40_000),
      payment: optionalText(40_000),
    })
    .optional(),

  maintenanceMode: z.boolean().optional(),
});

/**
 * The SEO and Homepage admin screens PATCH their own section, so they reuse the
 * matching branch of `updateSettingsSchema` rather than redeclaring it - one schema,
 * so a field added above cannot be forgotten here.
 */
export const seoSettingsSchema = updateSettingsSchema.shape.seo.unwrap();
export const homepageSettingsSchema = updateSettingsSchema.shape.homepage.unwrap();
export const maintenanceSchema = z.object({ maintenanceMode: z.boolean() });

/**
 * An enum, not a free slug. The controller looks the page up as `policies[slug]`, and
 * an unconstrained key there would reach inherited properties - `constructor` is not
 * `undefined`, so it would pass the "page exists" check.
 */
export const policyParams = z.object({
  slug: z.enum(['shipping', 'returns', 'privacy', 'terms', 'payment']),
});

// --- Small public forms ------------------------------------------------------

export const contactSchema = z.object({
  name: requiredText(80, 'Your name'),
  email: z.email('Enter a valid email address').max(160),
  phone: optionalText(20),
  subject: requiredText(140, 'Subject'),
  message: requiredText(2000, 'Message'),
});

export const newsletterSchema = z.object({
  email: z.email('Enter a valid email address').max(160),
  name: optionalText(80),
  source: optionalText(40),
  sessionId: optionalText(64),
});

/**
 * Unsubscribe accepts the address in the body or the query string: the link in the
 * footer of an email is a GET, and the account page uses a POST.
 */
export const unsubscribeSchema = z.object({
  email: z.email('Enter a valid email address').max(160),
});
export const unsubscribeQuery = z.object({ email: optionalText(160) });

export const contactListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(CONTACT_STATUS_VALUES).optional(),
  q: optionalText(80),
});

/** Triage on the admin Messages screen. */
export const contactUpdateSchema = z.object({
  status: z.enum(CONTACT_STATUS_VALUES).optional(),
  // Matches the model's own limit, so a long note fails here with a field-level
  // message instead of as a Mongoose ValidationError.
  adminNote: optionalText(1000),
});

export const subscriberListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  active: z.enum(['true', 'false']).optional(),
  q: optionalText(80),
});

/**
 * The analytics beacon. `type` is a free string rather than an enum on purpose: the
 * controller only records the three events it explicitly allows, and a 422 aimed at
 * a fire-and-forget beacon would just fill the log during a client/server version skew.
 */
export const analyticsEventSchema = z.object({
  type: requiredText(40, 'Event type'),
  sessionId: requiredText(64, 'Session id'),
  product: objectId.optional(),
  meta: z.record(z.string(), z.union([z.string().max(120), z.number(), z.boolean(), z.null()])).optional(),
});

export const analyticsRangeQuery = z.object({
  range: z.enum(['7d', '30d', '90d', '12m', 'mtd']).default('30d'),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** Which folder an upload lands in - an enum, so a caller cannot escape the tree. */
export const uploadFolderSchema = z.object({
  folder: z.enum(['products', 'categories', 'banners', 'blog', 'reviews', 'site']).optional(),
});

export const deleteUploadSchema = z.object({
  publicId: requiredText(300, 'Image id'),
});

// --- Admin users -------------------------------------------------------------

export const createStaffSchema = z.object({
  name: requiredText(80, 'Name'),
  email: z.email('Enter a valid email address').max(160),
  phone: nepaliPhone,
  password: z.string().min(10, 'Staff passwords must be at least 10 characters').max(128),
  role: z.enum(STAFF_ROLES),
});

/**
 * No `password` here: changing someone else's password is a separate, deliberately
 * narrow endpoint, so an accidental profile PATCH cannot rotate a colleague's
 * credentials as a side effect.
 */
export const updateStaffSchema = z.object({
  name: optionalText(80),
  phone: nepaliPhone.optional(),
  role: z.enum(STAFF_ROLES).optional(),
  isActive: z.boolean().optional(),
});

export const resetStaffPasswordSchema = z.object({
  password: z.string().min(10, 'Staff passwords must be at least 10 characters').max(128),
});

export const setCustomerActiveSchema = z.object({ isActive: z.boolean() });

export const customerListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(20),
  q: optionalText(80),
  active: z.enum(['true', 'false']).optional(),
  hasOrders: z.enum(['true', 'false']).optional(),
  sort: z.enum(['newest', 'spent', 'orders', 'name']).default('newest'),
});

// --- Inventory and reports ---------------------------------------------------

export const inventoryQuery = z.object({
  q: optionalText(80),
  status: z.enum(['in-stock', 'low-stock', 'out-of-stock']).optional(),
});

/** Addresses one size of one product: `/inventory/:productId/:variantId`. */
export const variantParams = z.object({
  productId: objectId,
  variantId: objectId,
});

/**
 * An absolute count, never a delta. A `+5` adjustment sent twice by an impatient
 * click would add ten; setting the shelf count to what was actually counted is
 * idempotent by construction.
 *
 * Only `stock` here - the product and variant are named in the path, so a body that
 * disagreed with the URL could not silently win.
 */
export const adjustStockSchema = z.object({
  stock: z.coerce.number().int().min(0).max(1_000_000),
});

export const bulkAdjustStockSchema = z.object({
  updates: z
    .array(
      z.object({
        productId: objectId,
        variantId: objectId,
        stock: z.coerce.number().int().min(0).max(1_000_000),
      })
    )
    .min(1, 'Nothing to update')
    .max(500),
});

export const reportQuery = z.object({
  range: z.enum(['7d', '30d', '90d', '12m', 'mtd']).default('30d'),
});

export const reportSectionParams = z.object({
  section: z.enum([
    'sales',
    'bestSellers',
    'categories',
    'payments',
    'districts',
    'customers',
    'reliability',
  ]),
});

export const exportOrdersQuery = z.object({
  from: dateish.optional(),
  to: dateish.optional(),
  status: z.enum(ORDER_STATUS_VALUES).optional(),
});

export default {
  createCouponSchema,
  updateCouponSchema,
  validateCouponSchema,
  couponListQuery,
  createReviewSchema,
  updateReviewSchema,
  moderateReviewSchema,
  reviewListQuery,
  createBlogPostSchema,
  updateBlogPostSchema,
  blogStatusSchema,
  blogListQuery,
  createBannerSchema,
  updateBannerSchema,
  bannerReorderSchema,
  bannerListQuery,
  createDeliveryZoneSchema,
  updateDeliveryZoneSchema,
  districtCheckQuery,
  updateSettingsSchema,
  seoSettingsSchema,
  homepageSettingsSchema,
  maintenanceSchema,
  policyParams,
  contactSchema,
  newsletterSchema,
  unsubscribeSchema,
  unsubscribeQuery,
  contactListQuery,
  contactUpdateSchema,
  subscriberListQuery,
  analyticsEventSchema,
  analyticsRangeQuery,
  uploadFolderSchema,
  deleteUploadSchema,
  createStaffSchema,
  updateStaffSchema,
  resetStaffPasswordSchema,
  setCustomerActiveSchema,
  customerListQuery,
  inventoryQuery,
  variantParams,
  adjustStockSchema,
  bulkAdjustStockSchema,
  reportQuery,
  reportSectionParams,
  exportOrdersQuery,
};
