/**
 * Document head management.
 *
 * A hand-rolled ~120 lines instead of react-helmet-async, which is unmaintained for
 * React 19, or a framework-level head API this SPA does not have. The approach: each
 * page calls `useSeo({...})`, we write the tags into `<head>`, and we tag everything we
 * create with `data-seo` so the next page can clear exactly what we own and leave the
 * static tags in index.html alone.
 *
 * Worth being honest about the limitation: a crawler that does not execute JavaScript
 * sees only index.html's fallback tags. Google renders JS and indexes these fine;
 * Facebook's and Twitter's scrapers do not. The server exposes
 * `GET /api/seo/structured-data` and a live `sitemap.xml`, and the deployment config
 * rewrites those to the API - so link-preview-sensitive URLs (products, blog posts)
 * should be pre-rendered or proxied if that matters commercially. Documented in README.
 */

const MANAGED = 'data-seo';
const SITE_NAME = 'Deeva Achar';
const TITLE_SUFFIX = ` | ${SITE_NAME}`;
const MAX_TITLE = 60;
const MAX_DESCRIPTION = 160;

const origin = () =>
  import.meta.env.VITE_SITE_URL?.replace(/\/$/, '') ||
  // The last fallback only applies without a `window`, which this SPA never is. It names
  // the deployment rather than a brand domain on purpose: a canonical pointing at a host
  // nobody owns is worse than one pointing at an ugly URL that actually serves the site.
  (typeof window !== 'undefined'
    ? window.location.origin
    : 'https://achar-web-appvercelapp.vercel.app');

/** Removes every tag a previous page added, leaving index.html's own tags in place. */
function clearManaged() {
  document.head.querySelectorAll(`[${MANAGED}]`).forEach((node) => node.remove());
}

function upsertMeta({ name, property, content }) {
  if (!content) return;
  const selector = name ? `meta[name="${name}"]` : `meta[property="${property}"]`;
  // Reuse index.html's tag when it exists, so we never end up with two `description`s.
  const existing = document.head.querySelector(selector);
  const node = existing ?? document.createElement('meta');
  if (name) node.setAttribute('name', name);
  if (property) node.setAttribute('property', property);
  node.setAttribute('content', String(content));
  if (!existing) {
    node.setAttribute(MANAGED, '');
    document.head.append(node);
  }
}

function upsertLink({ rel, href }) {
  if (!href) return;
  const existing = document.head.querySelector(`link[rel="${rel}"]`);
  const node = existing ?? document.createElement('link');
  node.setAttribute('rel', rel);
  node.setAttribute('href', href);
  if (!existing) {
    node.setAttribute(MANAGED, '');
    document.head.append(node);
  }
}

/**
 * Applies a page's metadata. Called from the `useSeo` hook rather than directly.
 *
 * `noIndex` is the important one: cart, checkout, account, admin, search results and
 * anything behind auth must not be indexed. Getting a `?q=` search page into the index
 * is a classic thin-content penalty.
 */
export function applySeo({
  title,
  description,
  canonical,
  image,
  type = 'website',
  noIndex = false,
  keywords,
  locale = 'en',
  structuredData,
  article,
} = {}) {
  clearManaged();

  // The suffix is skipped when the title already carries the brand. Site Settings ships a
  // `defaultTitle` of "Deeva Achar | Buy Authentic Nepali Pickle Online" and the home page
  // passes it through verbatim, so appending unconditionally printed the name twice in the
  // tab and in the search result - short enough to clear the length guard, which is why it
  // went unnoticed.
  const fullTitle = title
    ? title.includes(SITE_NAME) || title.length + TITLE_SUFFIX.length > MAX_TITLE + 12
      ? title
      : `${title}${TITLE_SUFFIX}`
    : `${SITE_NAME} - Homemade Nepali Achar, Delivered Fresh`;

  document.title = fullTitle;
  document.documentElement.lang = locale === 'np' ? 'ne' : 'en';

  const trimmedDescription = description
    ? description.length > MAX_DESCRIPTION
      ? `${description.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…`
      : description
    : undefined;

  const url = canonical
    ? canonical.startsWith('http')
      ? canonical
      : `${origin()}${canonical}`
    : typeof window !== 'undefined'
      ? `${origin()}${window.location.pathname}`
      : origin();

  upsertMeta({ name: 'description', content: trimmedDescription });
  upsertMeta({ name: 'keywords', content: Array.isArray(keywords) ? keywords.join(', ') : keywords });

  /**
   * `noindex, nofollow` on private pages. Canonical is deliberately omitted for them:
   * a canonical URL on a noindex page sends contradictory signals.
   */
  if (noIndex) {
    upsertMeta({ name: 'robots', content: 'noindex, nofollow' });
  } else {
    upsertMeta({ name: 'robots', content: 'index, follow, max-image-preview:large' });
    upsertLink({ rel: 'canonical', href: url });
  }

  const absoluteImage = image
    ? image.startsWith('http')
      ? image
      : `${origin()}${image}`
    : `${origin()}/og-default.png`;

  upsertMeta({ property: 'og:site_name', content: SITE_NAME });
  upsertMeta({ property: 'og:type', content: type });
  upsertMeta({ property: 'og:title', content: fullTitle });
  upsertMeta({ property: 'og:description', content: trimmedDescription });
  upsertMeta({ property: 'og:url', content: url });
  upsertMeta({ property: 'og:image', content: absoluteImage });
  upsertMeta({ property: 'og:locale', content: locale === 'np' ? 'ne_NP' : 'en_NP' });

  upsertMeta({ name: 'twitter:card', content: 'summary_large_image' });
  upsertMeta({ name: 'twitter:title', content: fullTitle });
  upsertMeta({ name: 'twitter:description', content: trimmedDescription });
  upsertMeta({ name: 'twitter:image', content: absoluteImage });

  if (article) {
    upsertMeta({ property: 'article:published_time', content: article.publishedAt });
    upsertMeta({ property: 'article:modified_time', content: article.updatedAt });
    upsertMeta({ property: 'article:author', content: article.author });
    upsertMeta({ property: 'article:section', content: article.section });
  }

  if (structuredData) injectJsonLd(structuredData);
}

/**
 * JSON-LD. Serialised with `<` escaped so a product name containing markup cannot
 * break out of the script element - the API sanitises HTML, but this is a different
 * escaping context and belongs here.
 */
export function injectJsonLd(data) {
  const blocks = Array.isArray(data) ? data : [data];
  for (const block of blocks) {
    if (!block) continue;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute(MANAGED, '');
    script.textContent = JSON.stringify(block).replace(/</g, '\\u003c');
    document.head.append(script);
  }
}

// --- Structured-data builders -------------------------------------------------

export function productJsonLd(product, { locale = 'en' } = {}) {
  if (!product) return null;
  const url = `${origin()}/product/${product.slug}`;
  const variants = product.variants ?? [];
  const prices = variants
    .filter((variant) => variant.isActive !== false)
    .map((variant) =>
      variant.discountPrice && variant.discountPrice < variant.price
        ? variant.discountPrice
        : variant.price
    );

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: locale === 'np' && product.nameNp ? product.nameNp : product.name,
    description: product.shortDescription,
    sku: product.sku,
    image: (product.images ?? []).map((img) => img.url).slice(0, 6),
    brand: { '@type': 'Brand', name: SITE_NAME },
    category: product.category?.name,
    url,
    ...(product.ratingCount > 0 && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: product.ratingAverage,
        reviewCount: product.ratingCount,
        bestRating: 5,
        worstRating: 1,
      },
    }),
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'NPR',
      lowPrice: prices.length ? Math.min(...prices) : product.minPrice,
      highPrice: prices.length ? Math.max(...prices) : product.maxPrice,
      offerCount: variants.length,
      availability:
        (product.totalStock ?? 0) > 0
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
      url,
    },
  };
}

/**
 * `[{name, url}]` -> a BreadcrumbList. `label`/`to` are accepted as aliases because the
 * visible breadcrumb components in the pages use those names for their own props.
 */
export function breadcrumbJsonLd(trail) {
  if (!trail?.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => {
      const path = crumb.url ?? crumb.to;
      return {
        '@type': 'ListItem',
        position: index + 1,
        name: crumb.name ?? crumb.label,
        ...(path && { item: path.startsWith('http') ? path : `${origin()}${path}` }),
      };
    }),
  };
}

export function articleJsonLd(post) {
  if (!post) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    image: post.featuredImage?.url,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    author: { '@type': 'Person', name: post.authorName },
    publisher: { '@type': 'Organization', name: SITE_NAME },
    mainEntityOfPage: `${origin()}/blog/${post.slug}`,
  };
}

export function faqJsonLd(items) {
  if (!items?.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}
