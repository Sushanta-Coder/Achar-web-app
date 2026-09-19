import mongoose from 'mongoose';
import { CURRENCY } from '../utils/constants.js';

/**
 * Singleton document (`key: 'default'`) holding everything the company can edit
 * without a redeploy: contact/NAP details, the announcement bar, homepage
 * content blocks, SEO defaults, tax and payment toggles.
 *
 * Read through `settingsService.getSettings()`, which caches it in memory and
 * invalidates on write - the storefront reads these values on nearly every
 * request, so hitting Mongo each time would be wasteful.
 */
const testimonialSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, maxlength: 90 },
    location: { type: String, maxlength: 90 },
    rating: { type: Number, min: 1, max: 5, default: 5 },
    quote: { type: String, required: true, maxlength: 500 },
    avatarUrl: String,
    isActive: { type: Boolean, default: true },
  },
  { _id: true }
);

const featureSchema = new mongoose.Schema(
  {
    icon: { type: String, maxlength: 8 },
    title: { type: String, required: true, maxlength: 80 },
    titleNp: { type: String, maxlength: 80 },
    description: { type: String, required: true, maxlength: 240 },
    descriptionNp: { type: String, maxlength: 240 },
  },
  { _id: true }
);

const siteSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true, immutable: true },

    company: {
      name: { type: String, default: 'Deeva Achar' },
      nameNp: { type: String, default: 'दीवा अचार' },
      // Both taglines are lifted straight off the badge: the Devanagari one is the line
      // under the wordmark, the English one is the three words around the bottom rim.
      tagline: { type: String, default: 'Tradition · Taste · Trust' },
      taglineNp: { type: String, default: 'लुकेको स्वाद' },
      legalName: { type: String, default: 'Deeva Achar Pvt. Ltd.' },
      panNumber: { type: String, default: '' },
      logoUrl: { type: String, default: '' },
      faviconUrl: { type: String, default: '' },
      // NAP - kept identical everywhere for local SEO consistency.
      email: { type: String, default: 'hello@deevaachar.com.np' },
      supportEmail: { type: String, default: 'support@deevaachar.com.np' },
      phone: { type: String, default: '9801234567' },
      whatsapp: { type: String, default: '9801234567' },
      landline: { type: String, default: '01-4001234' },
      address: {
        street: { type: String, default: 'Krishna Galli, Pulchowk' },
        municipality: { type: String, default: 'Lalitpur Metropolitan City' },
        wardNo: { type: Number, default: 3 },
        district: { type: String, default: 'Lalitpur' },
        province: { type: String, default: 'Bagmati' },
        country: { type: String, default: 'Nepal' },
        postalCode: { type: String, default: '44700' },
      },
      geo: { lat: { type: Number, default: 27.6785 }, lng: { type: Number, default: 85.3169 } },
      mapUrl: { type: String, default: '' },
      openingHours: {
        type: [String],
        default: ['Sunday-Friday 09:00-18:00', 'Saturday 10:00-15:00'],
      },
      social: {
        facebook: { type: String, default: '' },
        instagram: { type: String, default: '' },
        tiktok: { type: String, default: '' },
        youtube: { type: String, default: '' },
        twitter: { type: String, default: '' },
      },
    },

    announcement: {
      isActive: { type: Boolean, default: true },
      text: { type: String, default: 'Free delivery on orders above Rs. 2000 across Nepal' },
      textNp: { type: String, default: 'रु. २००० माथिको अर्डरमा नेपालभर निःशुल्क डेलिभरी' },
      link: { type: String, default: '/shop' },
    },

    homepage: {
      hero: {
        headline: { type: String, default: 'Authentic Nepali Pickles, Made With Love' },
        headlineNp: { type: String, default: 'प्रामाणिक नेपाली अचार, मायाले बनाइएको' },
        subheadline: {
          type: String,
          default:
            'Traditional flavors made from quality ingredients and delivered to your doorstep across Nepal.',
        },
        subheadlineNp: {
          type: String,
          default: 'गुणस्तरीय सामग्रीबाट बनेको परम्परागत स्वाद, नेपालभर तपाईंको घरमा।',
        },
        primaryCta: { label: { type: String, default: 'Shop Now' }, link: { type: String, default: '/shop' } },
        secondaryCta: {
          label: { type: String, default: 'Explore Pickles' },
          link: { type: String, default: '/categories' },
        },
        imageUrl: { type: String, default: '' },
        imageAlt: {
          type: String,
          default: 'Jars of traditional Nepali pickle surrounded by fresh chillies and spices',
        },
      },
      whyChooseUs: { type: [featureSchema], default: undefined },
      testimonials: { type: [testimonialSchema], default: undefined },
      promo: {
        isActive: { type: Boolean, default: true },
        title: { type: String, default: 'Festival Combo Packs' },
        subtitle: { type: String, default: 'Three of our best-selling pickles in one gift box.' },
        ctaLabel: { type: String, default: 'View Combos' },
        link: { type: String, default: '/shop?category=special-pickle' },
        imageUrl: { type: String, default: '' },
      },
      showBlogSection: { type: Boolean, default: true },
      showTestimonials: { type: Boolean, default: true },
      showNewsletter: { type: Boolean, default: true },
      featuredCategoryLimit: { type: Number, default: 8 },
      bestSellerLimit: { type: Number, default: 8 },
      newArrivalLimit: { type: Number, default: 8 },
    },

    seo: {
      defaultTitle: { type: String, default: 'Deeva Achar | Buy Authentic Nepali Pickle Online' },
      titleTemplate: { type: String, default: '%s | Deeva Achar' },
      defaultDescription: {
        type: String,
        default:
          'Buy authentic homemade-style Nepali achar online. Mango, chilli, lemon, gundruk and mixed pickles delivered across Nepal. Pay with Khalti, eSewa or cash on delivery.',
      },
      defaultKeywords: {
        type: [String],
        default: [
          'nepali pickle',
          'buy achar online nepal',
          'achar nepal',
          'नेपाली अचार',
          'अचार नेपाल',
          'homemade pickle nepal',
        ],
      },
      ogImageUrl: { type: String, default: '' },
      twitterHandle: { type: String, default: '' },
      googleSiteVerification: { type: String, default: '' },
      /** Turning this off emits `noindex` site-wide - useful for a staging deploy. */
      indexable: { type: Boolean, default: true },
    },

    commerce: {
      currency: { type: String, default: CURRENCY },
      /** VAT. 0 keeps prices inclusive, which is the norm for Nepali retail food. */
      taxRate: { type: Number, default: 0, min: 0, max: 30 },
      taxLabel: { type: String, default: 'VAT' },
      pricesIncludeTax: { type: Boolean, default: true },
      /** Global fallback; a delivery zone threshold takes precedence when set. */
      freeDeliveryThreshold: { type: Number, default: 2000 },
      minOrderAmount: { type: Number, default: 0 },
      allowGuestCheckout: { type: Boolean, default: true },
      /** Only reviews on delivered orders are accepted when true. */
      requireDeliveredOrderForReview: { type: Boolean, default: true },
      autoApproveReviews: { type: Boolean, default: false },
    },

    payments: {
      khalti: { isEnabled: { type: Boolean, default: true }, label: { type: String, default: 'Khalti' } },
      esewa: { isEnabled: { type: Boolean, default: true }, label: { type: String, default: 'eSewa' } },
      cod: {
        isEnabled: { type: Boolean, default: true },
        label: { type: String, default: 'Cash on Delivery' },
        maxOrderAmount: { type: Number, default: 20000 },
      },
    },

    policies: {
      shipping: { type: String, default: '' },
      returns: { type: String, default: '' },
      privacy: { type: String, default: '' },
      terms: { type: String, default: '' },
      payment: { type: String, default: '' },
    },

    maintenanceMode: { type: Boolean, default: false },
  },
  { timestamps: true, minimize: false }
);

export default mongoose.models.SiteSettings || mongoose.model('SiteSettings', siteSettingsSchema);
