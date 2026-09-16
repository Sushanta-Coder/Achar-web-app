/**
 * Database seeder.
 *
 *   npm run seed          # upsert - safe to re-run, keeps existing orders/customers
 *   npm run seed:reset    # wipe the catalogue and content collections first
 *
 * Two rules shape the whole file.
 *
 * **Idempotent by default.** Every insert is keyed on a natural unique field (slug,
 * SKU, coupon code, email) and updates in place if the record is already there. A
 * developer who runs `npm run seed` twice, or who runs it against a database that
 * already has real orders in it, should not lose anything or hit a duplicate key
 * error. `--reset` is the explicit opt-in to destruction, and it still never touches
 * orders, payments or real customers - see `resetCollections` for why.
 *
 * **No password in the repository.** The admin password comes from
 * `SEED_ADMIN_PASSWORD` and there is no fallback. If the variable is missing the seed
 * generates a random one and prints it once, in development only; in production it
 * refuses to create the account at all. A default admin password committed to Git is
 * how seeded shops get taken over.
 */
import mongoose from 'mongoose';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import env from '../config/env.js';
import logger from '../config/logger.js';
import { connectDatabase, disconnectDatabase, syncIndexes } from '../config/db.js';
import { ensureSettings, invalidateSettingsCache } from '../services/settingsService.js';
import {
  Banner,
  BlogPost,
  Category,
  Coupon,
  DeliveryZone,
  Product,
  Review,
  SiteSettings,
  User,
} from '../models/index.js';
import { ROLES, REVIEW_STATUS, BLOG_STATUS } from '../utils/constants.js';
import { categories as categorySeed, products as productSeed } from './data/catalog.js';
import {
  deliveryZones as zoneSeed,
  coupons as couponSeed,
  banners as bannerSeed,
  blogPosts as blogSeed,
  policies as policySeed,
} from './data/content.js';

const args = new Set(process.argv.slice(2));
const RESET = args.has('--reset');
const SKIP_DEMO = args.has('--no-demo');

const counts = {};
const tally = (label, created, updated) => {
  counts[label] = { created, updated };
};

/**
 * Upsert helper.
 *
 * Deliberately load-and-save rather than `findOneAndUpdate`: Mongoose runs `save`
 * middleware but not update middleware, and `Product`'s pre-save hook is what derives
 * `minPrice`, `totalStock` and `availableStock`. A product written with
 * `findOneAndUpdate` would have a price of 0 and appear out of stock.
 */
async function upsert(Model, key, doc) {
  const existing = await Model.findOne(key);
  if (existing) {
    existing.set(doc);
    await existing.save();
    return { doc: existing, created: false };
  }
  const created = await Model.create({ ...key, ...doc });
  return { doc: created, created: true };
}

/**
 * `--reset` clears content, never commerce.
 *
 * Orders, payments, carts, coupon redemptions and customer accounts are excluded on
 * purpose. Re-seeding is something you do while developing against a database that
 * may hold test orders you still need, and "reset the demo content" should never be
 * the command that destroys them. To start genuinely clean, drop the database.
 */
async function resetCollections() {
  const [products, cats, zones, coupons, banners, posts, reviews] = await Promise.all([
    Product.deleteMany({}),
    Category.deleteMany({}),
    DeliveryZone.deleteMany({}),
    Coupon.deleteMany({}),
    Banner.deleteMany({}),
    BlogPost.deleteMany({}),
    Review.deleteMany({}),
  ]);
  logger.info(
    `Reset: ${products.deletedCount} products, ${cats.deletedCount} categories, ` +
      `${zones.deletedCount} zones, ${coupons.deletedCount} coupons, ` +
      `${banners.deletedCount} banners, ${posts.deletedCount} posts, ${reviews.deletedCount} reviews`
  );
}

async function seedCategories() {
  const bySlug = new Map();
  let created = 0;

  for (const category of categorySeed) {
    const { slug, ...rest } = category;
    const result = await upsert(Category, { slug }, rest);
    bySlug.set(slug, result.doc);
    if (result.created) created += 1;
  }

  tally('categories', created, categorySeed.length - created);
  return bySlug;
}

async function seedProducts(categoriesBySlug) {
  let created = 0;

  for (const product of productSeed) {
    const { slug, categorySlug, variants, ...rest } = product;

    const category = categoriesBySlug.get(categorySlug);
    if (!category) throw new Error(`Product "${slug}" names unknown category "${categorySlug}"`);

    const existing = await Product.findOne({ slug });

    const prepared = variants.map((variant, index) => {
      /**
       * Variant SKUs are derived rather than written out by hand. The unique index on
       * `variants.sku` is global, so two products that both listed a "250G" SKU would
       * collide - deriving from the product SKU makes that impossible by construction.
       * The index suffix only appears where two sizes share a weight, which no seeded
       * product currently does.
       */
      const weight = String(variant.weightGrams).padStart(4, '0');
      const duplicate = variants.some((other, i) => i < index && other.weightGrams === variant.weightGrams);
      const sku = `${product.sku}-${weight}${duplicate ? `-${index}` : ''}`;

      /**
       * Stock is operational data, not content. A re-seed refreshes copy, pricing and
       * imagery, but must leave the counts alone - overwriting them would both undo an
       * admin's stock take and silently drop `reservedStock`, releasing units that a
       * pending order is still holding.
       */
      const previous = existing?.variants?.find((v) => v.size === variant.size);
      const stockFields = previous
        ? { stock: previous.stock, reservedStock: previous.reservedStock }
        : { stock: variant.stock, reservedStock: 0 };

      return { ...variant, ...stockFields, sku };
    });

    const doc = { ...rest, category: category._id, variants: prepared };

    if (existing) {
      existing.set(doc);
      await existing.save();
    } else {
      await Product.create({ slug, ...doc });
      created += 1;
    }
  }

  // `productCount` is denormalised onto the category for the shop's filter sidebar.
  for (const category of categoriesBySlug.values()) {
    const count = await Product.countDocuments({ category: category._id, isActive: true });
    if (category.productCount !== count) {
      category.productCount = count;
      await category.save();
    }
  }

  tally('products', created, productSeed.length - created);
}

async function seedDeliveryZones() {
  let created = 0;
  for (const zone of zoneSeed) {
    const { name, ...rest } = zone;
    const result = await upsert(DeliveryZone, { name }, rest);
    if (result.created) created += 1;
  }

  /**
   * Exactly one default. `deliveryService` falls back to the `isDefault` zone when no
   * district or province matches, and two of them would make the quote depend on
   * document order - the same address could be charged differently on two requests.
   */
  const defaults = await DeliveryZone.countDocuments({ isDefault: true });
  if (defaults !== 1) {
    logger.warn(`Expected exactly one default delivery zone, found ${defaults}`);
  }

  tally('deliveryZones', created, zoneSeed.length - created);
}

async function seedCoupons(categoriesBySlug) {
  let created = 0;

  for (const coupon of couponSeed) {
    const { code, appliesToCategorySlugs, ...rest } = coupon;

    const categoryIds = (appliesToCategorySlugs ?? [])
      .map((slug) => categoriesBySlug.get(slug)?._id)
      .filter(Boolean);

    const result = await upsert(Coupon, { code }, {
      ...rest,
      appliesTo: { categories: categoryIds, products: [] },
    });
    if (result.created) created += 1;
  }

  tally('coupons', created, couponSeed.length - created);
}

async function seedBanners() {
  let created = 0;
  for (const banner of bannerSeed) {
    const result = await upsert(Banner, { title: banner.title }, banner);
    if (result.created) created += 1;
  }
  tally('banners', created, bannerSeed.length - created);
}

async function seedBlogPosts(author) {
  let created = 0;

  for (const post of blogSeed) {
    const { slug, content, ...rest } = post;
    const result = await upsert(BlogPost, { slug }, {
      ...rest,
      // Trim the leading newline the template literals carry; the reading-time hook
      // counts words off this string.
      content: content.trim(),
      author: author?._id ?? null,
      status: post.status ?? BLOG_STATUS.DRAFT,
    });
    if (result.created) created += 1;
  }

  tally('blogPosts', created, blogSeed.length - created);
}

/**
 * Fills in the five policy pages and the handful of settings that describe *this*
 * shop, leaving every other field on its schema default. Written with `$set` on
 * specific paths rather than a whole-document replace so that settings an admin has
 * already customised through the dashboard survive a re-seed.
 */
async function seedSettings() {
  await ensureSettings();

  const update = {
    'policies.shipping': policySeed.shipping.trim(),
    'policies.returns': policySeed.returns.trim(),
    'policies.privacy': policySeed.privacy.trim(),
    'policies.terms': policySeed.terms.trim(),
    'policies.payment': policySeed.payment.trim(),
    'homepage.hero.imageUrl':
      'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=1600&q=80',
    'homepage.promo.link': '/shop?category=gift-hampers',
    'seo.ogImageUrl':
      'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=1200&q=80',
  };

  await SiteSettings.updateOne({ key: 'default' }, { $set: update });
  invalidateSettingsCache();
  tally('settings', 0, 1);
}

/**
 * The admin account.
 *
 * An existing admin's password is never overwritten - re-running the seed on a live
 * database must not reset the password an operator has since changed. Only a missing
 * account is created.
 */
async function seedAdmin() {
  const email = env.seed.adminEmail.toLowerCase();
  const existing = await User.findOne({ email });

  if (existing) {
    if (existing.role !== ROLES.ADMIN) {
      existing.role = ROLES.ADMIN;
      await existing.save();
      logger.info(`Promoted existing user ${email} to admin`);
    }
    tally('admin', 0, 1);
    return existing;
  }

  let password = env.seed.adminPassword;
  let generated = false;

  if (!password) {
    if (env.isProd) {
      throw new Error(
        'SEED_ADMIN_PASSWORD is required to create the admin account in production. ' +
          'Set it in the environment and re-run the seed.'
      );
    }
    // Development convenience only. Printed once below and never written to disk.
    password = `dev-${crypto.randomBytes(9).toString('base64url')}`;
    generated = true;
  }

  const admin = await User.create({
    name: env.seed.adminName,
    email,
    password,
    role: ROLES.ADMIN,
    emailVerified: true,
    isActive: true,
  });

  if (generated) {
    logger.warn(
      `Generated a development admin password for ${email}: ${password}\n` +
        '  Save it now - it is not stored anywhere. Set SEED_ADMIN_PASSWORD to choose your own.'
    );
  } else {
    logger.info(`Created admin account ${email} using SEED_ADMIN_PASSWORD`);
  }

  tally('admin', 1, 0);
  return admin;
}

const demoCustomers = [
  {
    name: 'Sabina Maharjan',
    email: 'sabina@example.com',
    phone: '9801111111',
    address: {
      label: 'Home',
      fullName: 'Sabina Maharjan',
      phone: '9801111111',
      province: 'Bagmati',
      district: 'Lalitpur',
      municipality: 'Lalitpur Metropolitan City',
      wardNo: 12,
      tole: 'Jhamsikhel',
      landmark: 'Near Summit Hotel',
      isDefault: true,
    },
  },
  {
    name: 'Bikash Gurung',
    email: 'bikash@example.com',
    phone: '9802222222',
    address: {
      label: 'Home',
      fullName: 'Bikash Gurung',
      phone: '9802222222',
      province: 'Gandaki',
      district: 'Kaski',
      municipality: 'Pokhara Metropolitan City',
      wardNo: 8,
      tole: 'Lakeside',
      isDefault: true,
    },
  },
  {
    name: 'Anita Karki',
    email: 'anita@example.com',
    phone: '9803333333',
    address: {
      label: 'Home',
      fullName: 'Anita Karki',
      phone: '9803333333',
      province: 'Koshi',
      district: 'Morang',
      municipality: 'Biratnagar Metropolitan City',
      wardNo: 4,
      tole: 'Bargachhi',
      isDefault: true,
    },
  },
];

/**
 * Demo customers, for exercising login, addresses, wishlist and reviews by hand.
 *
 * Never created in production - `@example.com` accounts with a shared password on a
 * live shop are an open door, and there is no legitimate reason for them to exist
 * there. Skipped entirely (with a note) when `SEED_DEMO_PASSWORD` is unset.
 */
async function seedDemoCustomers() {
  if (SKIP_DEMO) return [];

  if (env.isProd) {
    logger.info('Skipping demo customers: never seeded in production');
    return [];
  }

  if (!env.seed.demoPassword) {
    logger.info('Skipping demo customers: set SEED_DEMO_PASSWORD to create them');
    return [];
  }

  if (env.seed.demoPassword.length < 8) {
    logger.warn('Skipping demo customers: SEED_DEMO_PASSWORD must be at least 8 characters');
    return [];
  }

  const users = [];
  let created = 0;

  for (const customer of demoCustomers) {
    const { address, ...rest } = customer;
    const existing = await User.findOne({ email: customer.email });

    if (existing) {
      users.push(existing);
      continue;
    }

    const user = await User.create({
      ...rest,
      password: env.seed.demoPassword,
      role: ROLES.CUSTOMER,
      emailVerified: true,
      addresses: [address],
      marketingOptIn: true,
    });
    users.push(user);
    created += 1;
  }

  if (created) tally('demoCustomers', created, users.length - created);
  return users;
}

/**
 * A handful of approved reviews so the storefront does not launch showing zero stars
 * on every product - star ratings are a layout element as much as a data one, and a
 * grid of empty rating rows hides real spacing problems until go-live.
 *
 * `isVerifiedPurchase` is false and `order` is null: these customers have not bought
 * anything, and claiming otherwise would put a "Verified Purchase" badge on a review
 * that is a fixture. The badge means something; seeded data should not borrow it.
 */
const reviewSeed = [
  { slug: 'mula-ko-achar-radish-pickle', rating: 5, title: 'Exactly like my grandmother made', comment: 'The radish is properly dried, not soggy like the supermarket ones. This is the real thing and it arrived in two days.' },
  { slug: 'mula-ko-achar-radish-pickle', rating: 4, title: 'Very good, slightly salty', comment: 'Great flavour and the oil is clearly good quality. A little saltier than I make at home, but that is a matter of taste.' },
  { slug: 'lapsi-ko-achar', rating: 5, title: 'Perfect balance', comment: 'Sweet and sour without being sugary. The timur comes through properly. I order the 1kg jar every couple of months.' },
  { slug: 'buff-sukuti-achar', rating: 5, title: 'Genuinely spicy', comment: 'The meat is hand-shredded, you can tell. Hot but not so hot you cannot taste anything else. Excellent with chiura.' },
  { slug: 'gundruk-ko-achar', rating: 4, title: 'Tastes like home', comment: 'Properly sour and smoky. I have been buying gundruk in Kathmandu for years and this is better than most.' },
  { slug: 'golbheda-ko-achar-momo-chutney', rating: 5, title: 'Better than most momo shops', comment: 'You can taste that the tomatoes were roasted rather than boiled. Sesame is well balanced.' },
  { slug: 'dalle-khursani-achar', rating: 5, title: 'Warning: actually hot', comment: 'This is not a mild pickle pretending to be spicy. Quarter spoon is enough. Wonderful flavour under the heat.' },
  { slug: 'aap-ko-achar-mango-pickle', rating: 4, title: 'Nice and sour', comment: 'The sour style, not the sweet chhundo. Mango pieces stayed firm which I appreciate.' },
];

async function seedReviews(users) {
  if (!users.length) return;

  let created = 0;

  for (const [index, review] of reviewSeed.entries()) {
    const product = await Product.findOne({ slug: review.slug }).select('_id');
    if (!product) continue;

    const user = users[index % users.length];

    // The unique { product, user } index makes this the natural upsert key, and also
    // means a longer review list than the demo-customer list would silently collide.
    const existing = await Review.findOne({ product: product._id, user: user._id });
    if (existing) continue;

    await Review.create({
      product: product._id,
      user: user._id,
      order: null,
      rating: review.rating,
      title: review.title,
      comment: review.comment,
      isVerifiedPurchase: false,
      status: REVIEW_STATUS.APPROVED,
    });
    created += 1;
  }

  if (created) tally('reviews', created, reviewSeed.length - created);
  await recalculateRatings();
}

/** Recomputes the denormalised rating fields the product cards read. */
async function recalculateRatings() {
  const grouped = await Review.aggregate([
    { $match: { status: REVIEW_STATUS.APPROVED } },
    { $group: { _id: '$product', average: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);

  await Promise.all(
    grouped.map(({ _id, average, count }) =>
      Product.updateOne(
        { _id },
        { $set: { ratingAverage: Math.round(average * 10) / 10, ratingCount: count } }
      )
    )
  );
}

/**
 * Core seed steps, database already connected by the caller.
 * Exported so server.js can call it in-process when running the in-memory fallback.
 */
export async function seedAll({ reset = false } = {}) {
  const started = Date.now();

  if (reset) await resetCollections();

  const admin = await seedAdmin();
  const categoriesBySlug = await seedCategories();

  await seedProducts(categoriesBySlug);
  await seedDeliveryZones();
  await seedCoupons(categoriesBySlug);
  await seedBanners();
  await seedBlogPosts(admin);
  await seedSettings();

  const customers = await seedDemoCustomers();
  await seedReviews(customers);

  const summary = Object.entries(counts)
    .map(([label, { created, updated }]) => `  ${label}: ${created} created, ${updated} updated`)
    .join('\n');

  logger.info(`Seed complete in ${((Date.now() - started) / 1000).toFixed(1)}s\n${summary}`);
}

async function run() {
  logger.info(`Seeding ${env.mongoUri.replace(/\/\/[^@]+@/, '//***@')}${RESET ? ' (--reset)' : ''}`);

  await connectDatabase();
  await seedAll({ reset: RESET });

  // Production does not use autoIndex, so the seed is the documented place to build
  // them — once, over finished data, rather than maintained through every insert above.
  if (env.isProd) {
    logger.info('Building indexes...');
    await syncIndexes();
  }
}

// Only execute when this file is the entry point, not when imported by server.js.
const isMain = process.argv[1] &&
  fileURLToPath(import.meta.url).replace(/\\/g, '/') === process.argv[1].replace(/\\/g, '/');

if (isMain) {
  run()
    .then(async () => {
      await disconnectDatabase();
      process.exit(0);
    })
    .catch(async (error) => {
      logger.error(`Seed failed: ${error.message}`);
      if (!env.isProd) logger.error(error.stack);
      await mongoose.connection.close().catch(() => {});
      process.exit(1);
    });
}
