import Product from '../models/Product.js';
import Category from '../models/Category.js';
import BlogPost from '../models/BlogPost.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { getSettings, getPublicSettings } from '../services/settingsService.js';
import { BLOG_STATUS, SPICE_LEVELS } from '../utils/constants.js';
import env from '../config/env.js';

/**
 * SEO surfaces: sitemap, robots.txt and the JSON-LD the storefront embeds.
 *
 * These are served by the API rather than generated at build time because the
 * catalogue changes without a redeploy - a product added this morning has to be
 * crawlable this afternoon. `vercel.json` / `netlify.toml` rewrite
 * `/sitemap.xml` and `/robots.txt` on the public domain to these endpoints, so
 * crawlers see them at the root of the site, which is where they look.
 *
 * Every URL is built from `clientUrl`, never from the request's Host header: a
 * crawler that reaches the API through a preview domain must not be handed a
 * sitemap full of preview URLs pointing at duplicate content.
 *
 * `seo.indexable` is the master switch. A staging deploy sets it false and gets a
 * blanket `Disallow: /`, which is far harder to get wrong than remembering to add
 * a robots file to one environment and not another.
 */

const site = () => env.clientUrl;

/** Static pages, with the priorities a shop actually wants. */
const STATIC_ROUTES = [
  { path: '/', priority: 1.0, changefreq: 'daily' },
  { path: '/shop', priority: 0.9, changefreq: 'daily' },
  { path: '/categories', priority: 0.8, changefreq: 'weekly' },
  { path: '/about', priority: 0.6, changefreq: 'monthly' },
  { path: '/contact', priority: 0.6, changefreq: 'monthly' },
  { path: '/faq', priority: 0.5, changefreq: 'monthly' },
  { path: '/blog', priority: 0.7, changefreq: 'weekly' },
  { path: '/shipping-policy', priority: 0.4, changefreq: 'yearly' },
  { path: '/return-policy', priority: 0.4, changefreq: 'yearly' },
  { path: '/payment-policy', priority: 0.4, changefreq: 'yearly' },
  { path: '/privacy-policy', priority: 0.3, changefreq: 'yearly' },
  { path: '/terms-conditions', priority: 0.3, changefreq: 'yearly' },
];

/**
 * Pages that must never be indexed: they are either private, transactional or
 * infinite. `/search` in particular generates unbounded thin pages, which is a
 * classic way to dilute a small site's crawl budget.
 */
const DISALLOWED = [
  '/admin',
  '/account',
  '/cart',
  '/checkout',
  '/order-success',
  '/payment-failed',
  '/order-tracking',
  '/wishlist',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/search',
  '/api/',
];

const escapeXml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const isoDate = (date) => new Date(date ?? Date.now()).toISOString().slice(0, 10);

function urlNode({ path, lastmod, changefreq, priority, images = [] }) {
  const parts = [`    <loc>${escapeXml(`${site()}${path}`)}</loc>`];
  if (lastmod) parts.push(`    <lastmod>${isoDate(lastmod)}</lastmod>`);
  if (changefreq) parts.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority !== undefined) parts.push(`    <priority>${priority.toFixed(1)}</priority>`);

  // Image entries help Nepali food searches surface the jar photo, which is what
  // people actually click on.
  for (const image of images) {
    parts.push(
      '    <image:image>',
      `      <image:loc>${escapeXml(image.url)}</image:loc>`,
      image.alt ? `      <image:title>${escapeXml(image.alt)}</image:title>` : '',
      '    </image:image>'
    );
  }

  return `  <url>\n${parts.filter(Boolean).join('\n')}\n  </url>`;
}

/**
 * `GET /api/seo/sitemap.xml`
 *
 * One sitemap rather than an index: a shop of this size is well under the 50,000
 * URL / 50 MB limit, and a single file is easier to verify by eye. The queries are
 * projected down to the four fields that matter, so this stays a cheap request
 * even as the catalogue grows.
 */
export const sitemap = asyncHandler(async (_req, res) => {
  const settings = await getSettings();

  // A non-indexable deployment publishes a sitemap containing only the homepage,
  // so a crawler that finds the URL anyway learns nothing else about the staging site.
  if (!settings.seo.indexable) {
    return sendXml(res, wrapUrlset([urlNode({ path: '/', changefreq: 'daily', priority: 1.0 })]));
  }

  const [products, categories, posts] = await Promise.all([
    Product.find({ isActive: true })
      .select('slug updatedAt images thumbnail')
      .sort({ updatedAt: -1 })
      .limit(5000)
      .lean(),
    Category.find({ isActive: true }).select('slug updatedAt').lean(),
    BlogPost.find({ status: BLOG_STATUS.PUBLISHED, publishedAt: { $lte: new Date() } })
      .select('slug updatedAt publishedAt')
      .sort({ publishedAt: -1 })
      .limit(1000)
      .lean(),
  ]);

  const nodes = [
    ...STATIC_ROUTES.map((route) => urlNode({ ...route, lastmod: new Date() })),

    ...categories.map((category) =>
      urlNode({
        path: `/category/${category.slug}`,
        lastmod: category.updatedAt,
        changefreq: 'weekly',
        priority: 0.7,
      })
    ),

    ...products.map((product) =>
      urlNode({
        path: `/product/${product.slug}`,
        lastmod: product.updatedAt,
        changefreq: 'weekly',
        priority: 0.8,
        images: primaryImage(product),
      })
    ),

    ...posts.map((post) =>
      urlNode({
        path: `/blog/${post.slug}`,
        lastmod: post.updatedAt ?? post.publishedAt,
        changefreq: 'monthly',
        priority: 0.6,
      })
    ),

    // Spice-level filters are the one faceted URL worth indexing - each maps to a
    // real search ("hot nepali pickle") and returns a stable, non-empty set.
    ...SPICE_LEVELS.map((level) =>
      urlNode({ path: `/shop?spice=${level}`, changefreq: 'weekly', priority: 0.4 })
    ),
  ];

  return sendXml(res, wrapUrlset(nodes));
});

const primaryImage = (product) => {
  const image = product.thumbnail?.url ? product.thumbnail : product.images?.[0];
  return image?.url ? [{ url: image.url, alt: image.alt }] : [];
};

const wrapUrlset = (nodes) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ` +
  `xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
  `${nodes.join('\n')}\n</urlset>\n`;

function sendXml(res, body) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  // Crawlers re-fetch often; an hour of caching is plenty and keeps the DB quiet.
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.send(body);
}

/**
 * `GET /api/seo/robots.txt`
 *
 * Generated rather than static so `seo.indexable` can close the whole site from
 * the admin panel, and so the sitemap line always points at the right domain.
 */
export const robots = asyncHandler(async (_req, res) => {
  const settings = await getSettings();

  const lines = ['User-agent: *'];

  if (!settings.seo.indexable) {
    lines.push('Disallow: /');
  } else {
    lines.push(...DISALLOWED.map((path) => `Disallow: ${path}`));
    lines.push('Allow: /');
    lines.push('', `Sitemap: ${site()}/sitemap.xml`);
    // Politeness rather than necessity, but it protects a small VPS from an
    // aggressive crawler walking every filter combination.
    lines.push('', 'User-agent: AhrefsBot', 'Crawl-delay: 10');
    lines.push('', 'User-agent: SemrushBot', 'Crawl-delay: 10');
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.send(`${lines.join('\n')}\n`);
});

/**
 * Organization + WebSite + LocalBusiness JSON-LD.
 *
 * Built server-side from the same settings document that renders the footer, so
 * the structured data and the visible NAP can never drift apart - inconsistent
 * name/address/phone is the most common local-SEO own goal.
 */
export const structuredData = asyncHandler(async (_req, res) => {
  // Plain object rather than the Mongoose document: JSON-LD has to serialise cleanly,
  // and `openingHours` / `social` need to be a real array and a real object.
  const { company, seo } = await getPublicSettings();
  const url = site();

  const address = {
    '@type': 'PostalAddress',
    streetAddress: [company.address.street, company.address.wardNo && `Ward ${company.address.wardNo}`]
      .filter(Boolean)
      .join(', '),
    addressLocality: company.address.municipality,
    addressRegion: `${company.address.province} Province`,
    postalCode: company.address.postalCode,
    addressCountry: 'NP',
  };

  const socialProfiles = Object.values(company.social ?? {}).filter(Boolean);

  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${url}/#organization`,
    name: company.name,
    alternateName: company.nameNp,
    legalName: company.legalName,
    url,
    logo: company.logoUrl || undefined,
    image: seo.ogImageUrl || company.logoUrl || undefined,
    description: seo.defaultDescription,
    address,
    email: company.email,
    telephone: `+977-${company.phone}`,
    sameAs: socialProfiles.length ? socialProfiles : undefined,
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: `+977-${company.phone}`,
      contactType: 'customer service',
      areaServed: 'NP',
      availableLanguage: ['en', 'ne'],
    },
  };

  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${url}/#website`,
    url,
    name: company.name,
    description: seo.defaultDescription,
    publisher: { '@id': `${url}/#organization` },
    inLanguage: ['en-NP', 'ne-NP'],
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${url}/search?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };

  /**
   * `FoodEstablishment` rather than plain `LocalBusiness`: it is the closest match
   * for a licensed pickle kitchen with a shopfront, and it is what Google uses for
   * the food-related local pack.
   */
  const localBusiness = {
    '@context': 'https://schema.org',
    '@type': 'FoodEstablishment',
    '@id': `${url}/#localbusiness`,
    name: company.name,
    image: seo.ogImageUrl || company.logoUrl || undefined,
    url,
    telephone: `+977-${company.phone}`,
    email: company.email,
    priceRange: 'NPR 150 - NPR 2500',
    servesCuisine: 'Nepali',
    address,
    geo: { '@type': 'GeoCoordinates', latitude: company.geo.lat, longitude: company.geo.lng },
    hasMap: company.mapUrl || undefined,
    openingHours: company.openingHours,
    areaServed: { '@type': 'Country', name: 'Nepal' },
    paymentAccepted: 'Khalti, eSewa, Cash on Delivery',
    currenciesAccepted: 'NPR',
    parentOrganization: { '@id': `${url}/#organization` },
  };

  return sendSuccess(res, {
    data: {
      // `@graph` lets the client emit one <script> tag instead of three.
      graph: {
        '@context': 'https://schema.org',
        '@graph': [
          stripUndefined(organization),
          stripUndefined(website),
          stripUndefined(localBusiness),
        ].map(withoutContext),
      },
      meta: {
        defaultTitle: seo.defaultTitle,
        titleTemplate: seo.titleTemplate,
        defaultDescription: seo.defaultDescription,
        defaultKeywords: seo.defaultKeywords,
        ogImageUrl: seo.ogImageUrl,
        twitterHandle: seo.twitterHandle,
        googleSiteVerification: seo.googleSiteVerification,
        indexable: seo.indexable,
        siteUrl: url,
      },
    },
  });
});

/** `undefined` values are legal JS but invalid JSON-LD noise, so drop them. */
const stripUndefined = (object) => JSON.parse(JSON.stringify(object));

/** Inside an `@graph`, the context belongs on the wrapper, not each node. */
const withoutContext = ({ '@context': _context, ...rest }) => rest;

export default { sitemap, robots, structuredData };
