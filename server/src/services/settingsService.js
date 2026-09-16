import SiteSettings from '../models/SiteSettings.js';
import logger from '../config/logger.js';

/**
 * Site settings are read on nearly every storefront request (announcement bar,
 * SEO defaults, payment toggles, tax rate). They change rarely, so they are
 * cached in process memory with a short TTL and invalidated explicitly on write.
 */
const TTL_MS = 60_000;

let cache = null;
let cachedAt = 0;

const DEFAULT_FEATURES = [
  {
    icon: '🇳🇵',
    title: 'Authentic Nepali Taste',
    titleNp: 'प्रामाणिक नेपाली स्वाद',
    description: 'Family recipes from Kathmandu, Palpa and Ilam - ground, sun-cured and jarred the traditional way.',
    descriptionNp: 'काठमाडौं, पाल्पा र इलामका पारिवारिक विधि अनुसार तयार।',
  },
  {
    icon: '🌿',
    title: 'Quality Ingredients',
    titleNp: 'गुणस्तरीय सामग्री',
    description: 'Seasonal produce bought directly from Nepali farmers, cold-pressed mustard oil, no artificial colour.',
    descriptionNp: 'नेपाली किसानबाट सिधै किनिएको मौसमी उत्पादन, शुद्ध तोरीको तेल।',
  },
  {
    icon: '🧼',
    title: 'Hygienically Prepared',
    titleNp: 'स्वच्छ तरिकाले तयार',
    description: 'Prepared in a licensed kitchen, batch-coded and sealed in food-grade glass jars.',
    descriptionNp: 'इजाजतपत्र प्राप्त भान्सामा तयार, ब्याच कोड सहित सिल गरिएको।',
  },
  {
    icon: '🚚',
    title: 'Fast Delivery',
    titleNp: 'छिटो डेलिभरी',
    description: 'Inside the Valley in 1-2 days, and 2-5 days to major cities across Nepal.',
    descriptionNp: 'उपत्यकाभित्र १-२ दिन, नेपालका प्रमुख सहरमा २-५ दिन।',
  },
  {
    icon: '🔒',
    title: 'Secure Payment',
    titleNp: 'सुरक्षित भुक्तानी',
    description: 'Pay with Khalti or eSewa - every transaction is verified on our server before dispatch.',
    descriptionNp: 'खल्ती वा इसेवाबाट भुक्तानी - प्रत्येक कारोबार सर्भरमा प्रमाणित।',
  },
];

const DEFAULT_TESTIMONIALS = [
  {
    name: 'Sunita Shrestha',
    location: 'Lalitpur',
    rating: 5,
    quote:
      'The lapsi achar tastes exactly like the one my grandmother used to make. Arrived in two days, sealed properly, nothing leaked.',
  },
  {
    name: 'Bikash Gurung',
    location: 'Pokhara',
    rating: 5,
    quote:
      'I order the 1kg mango pickle every two months for my family. Consistent quality and the eSewa payment is instant.',
  },
  {
    name: 'Anita Karki',
    location: 'Biratnagar',
    rating: 4,
    quote:
      'Gundruk ko achar is genuinely spicy - exactly as described. Delivery to Biratnagar took four days, which is fair.',
  },
];

/** Creates the singleton on first boot so the storefront always has content. */
export async function ensureSettings() {
  let settings = await SiteSettings.findOne({ key: 'default' });
  if (!settings) {
    settings = await SiteSettings.create({
      key: 'default',
      homepage: { whyChooseUs: DEFAULT_FEATURES, testimonials: DEFAULT_TESTIMONIALS },
    });
    logger.info('Created default site settings document');
  }
  return settings;
}

export async function getSettings({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cachedAt < TTL_MS) return cache;
  const settings = await ensureSettings();
  cache = settings;
  cachedAt = Date.now();
  return settings;
}

/** Plain object, safe to send to the storefront (no secrets live in settings). */
export async function getPublicSettings() {
  const settings = await getSettings();
  const json = settings.toObject({ virtuals: true });
  delete json.__v;
  delete json._id;
  delete json.createdAt;
  delete json.updatedAt;
  return json;
}

export async function updateSettings(patch) {
  const settings = await ensureSettings();
  settings.set(patch);
  await settings.save();
  invalidateSettingsCache();
  return settings;
}

export function invalidateSettingsCache() {
  cache = null;
  cachedAt = 0;
}

export { DEFAULT_FEATURES, DEFAULT_TESTIMONIALS };

export default { getSettings, getPublicSettings, updateSettings, invalidateSettingsCache, ensureSettings };
