import { Link } from 'react-router-dom';
import Icon from '../components/ui/Icon';
import { SkeletonCards } from '../components/ui/Spinner';
import { ProductGrid, ProductRail } from '../components/shop/ProductCard';
import { useFetch } from '../hooks/useApi';
import { useSettings } from '../context/SettingsContext';
import useSeo from '../hooks/useSeo';
import { formatPrice, localised } from '../lib/format';

/**
 * Home page.
 *
 * Three requests, all in parallel and none blocking the hero: the rails
 * (`/products/storefront`), the featured categories, and the hero banners. Copy comes from
 * the settings document rather than being hardcoded here, so the shop owner can rewrite the
 * headline without a deploy — that was the point of putting `homepage.hero` in settings.
 *
 * The hero renders from settings alone and does not wait on any fetch, so the largest
 * element on the page paints immediately. Rails below it fill in as they arrive.
 */

const FALLBACK_HERO = {
  headline: 'Achar made the way your aama makes it',
  subheadline:
    'Small batches, sun-dried spices and mustard oil pressed in Nepal. No preservatives, no shortcuts — just the pickle you grew up eating.',
  primaryCta: 'Shop the shelf',
  secondaryCta: 'Our story',
};

const FALLBACK_REASONS = [
  {
    icon: 'leaf',
    title: 'Made in small batches',
    description: 'Cooked in 20 kg lots, not tonnes, so nothing sits in a warehouse losing its bite.',
  },
  {
    icon: 'flame',
    title: 'Spices ground fresh',
    description: 'Timur, methi and dried chilli roasted and ground the week they go into the jar.',
  },
  {
    icon: 'truck',
    title: 'Delivered across Nepal',
    description: 'Same-day inside Kathmandu Valley, two to five days everywhere else.',
  },
  {
    icon: 'checkCircle',
    title: 'No preservatives',
    description: 'Mustard oil and salt do the preserving, the way achar has always been kept.',
  },
];

export default function Home() {
  const { settings, locale } = useSettings();

  const rails = useFetch('/products/storefront');
  const categories = useFetch('/categories', { params: { featured: 'true' } });
  const banners = useFetch('/banners', { params: { position: 'hero' } });

  const homepage = settings?.homepage ?? {};
  const hero = { ...FALLBACK_HERO, ...(homepage.hero ?? {}) };
  // Settings returns CTAs as { label, link } objects; FALLBACK_HERO uses plain strings.
  // Normalize to a string so neither shape crashes when rendered as a JSX child.
  const ctaLabel = (v) => (v && typeof v === 'object' ? v.label : v);
  const reasons = homepage.whyChooseUs?.length ? homepage.whyChooseUs : FALLBACK_REASONS;
  const testimonials = (homepage.testimonials ?? []).filter((entry) => entry.isActive !== false);
  const promo = homepage.promo;
  const heroBanner = banners.data?.banners?.hero?.[0];

  useSeo({
    title: settings?.seo?.defaultTitle || 'Homemade Nepali Achar, Delivered Fresh',
    description:
      settings?.seo?.defaultDescription ||
      'Small-batch Nepali pickle made with sun-dried spices and mustard oil. Delivered across Nepal.',
    canonical: '/',
    image: settings?.seo?.ogImageUrl,
    locale,
    // Tells Google the site has a search box, which can surface a sitelinks searchbox.
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: settings?.company?.name ?? 'Aama ko Achar',
      url: window.location.origin,
      potentialAction: {
        '@type': 'SearchAction',
        target: `${window.location.origin}/search?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
  });

  return (
    <>
      {/* --- Hero ------------------------------------------------------------ */}
      <section className="from-cream-200 via-cream-100 to-cream-50 bg-gradient-to-br">
        <div className="container-page grid items-center gap-8 py-10 sm:py-14 lg:grid-cols-2 lg:gap-12 lg:py-20">
          <div className="animate-fade-up">
            {promo?.isActive && promo?.title ? (
              <Link
                to={promo.link || '/shop'}
                className="border-brand-200 bg-brand-50 text-brand-800 hover:bg-brand-100 mb-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
              >
                <Icon name="tag" className="size-3.5" />
                {promo.title}
                <Icon name="arrowRight" className="size-3.5" />
              </Link>
            ) : null}

            <h1 className="text-3xl leading-tight sm:text-4xl lg:text-5xl">
              {locale === 'np' && hero.headlineNp ? hero.headlineNp : hero.headline}
            </h1>

            <p className="text-ink-600 mt-4 max-w-prose text-base sm:text-lg">
              {locale === 'np' && hero.subheadlineNp ? hero.subheadlineNp : hero.subheadline}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/shop" className="btn-primary btn-lg">
                <Icon name="cart" className="size-5" />
                {ctaLabel(hero.primaryCta) || 'Shop the shelf'}
              </Link>
              <Link to="/about" className="btn-outline btn-lg">
                {ctaLabel(hero.secondaryCta) || 'Our story'}
              </Link>
            </div>

            <dl className="text-ink-500 mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <div className="flex items-center gap-1.5">
                <Icon name="truck" className="text-leaf-600 size-4" />
                <dt className="sr-only">Delivery</dt>
                <dd>
                  {settings?.commerce?.freeDeliveryThreshold
                    ? `Free delivery over ${formatPrice(settings.commerce.freeDeliveryThreshold)}`
                    : 'Delivered across Nepal'}
                </dd>
              </div>
              <div className="flex items-center gap-1.5">
                <Icon name="wallet" className="text-leaf-600 size-4" />
                <dt className="sr-only">Payment</dt>
                <dd>Khalti, eSewa or cash on delivery</dd>
              </div>
            </dl>
          </div>

          <div className="relative">
            {/*
              A banner set in the admin wins over the settings hero image; both are
              optional, and with neither the block collapses rather than leaving a hole.
            */}
            {heroBanner?.image?.desktop || hero.imageUrl ? (
              <picture>
                {heroBanner?.image?.mobile ? (
                  <source media="(max-width: 640px)" srcSet={heroBanner.image.mobile} />
                ) : null}
                <img
                  src={heroBanner?.image?.desktop || hero.imageUrl}
                  alt={heroBanner?.image?.alt || hero.imageAlt || 'Jars of homemade Nepali achar'}
                  // The hero is the largest paint on the page, so it loads eagerly and
                  // gets a high fetch priority rather than being lazy like the rails.
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="shadow-card aspect-4/3 w-full rounded-2xl object-cover"
                />
              </picture>
            ) : (
              <div className="bg-cream-200 text-cream-400 shadow-card grid aspect-4/3 w-full place-items-center rounded-2xl">
                <Icon name="box" className="size-16" />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* --- Featured categories -------------------------------------------- */}
      {categories.data?.categories?.length ? (
        <section className="container-page py-8 sm:py-10">
          <h2 className="mb-4 text-xl sm:text-2xl">Shop by kind</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 sm:gap-4">
            {categories.data.categories.slice(0, 6).map((category) => (
              <Link
                key={category._id}
                to={`/category/${category.slug}`}
                className="card group flex flex-col items-center gap-2 p-3 text-center transition-shadow hover:shadow-card-hover"
              >
                <span className="bg-cream-200 grid size-14 place-items-center overflow-hidden rounded-full">
                  {category.image?.url ? (
                    <img
                      src={category.image.url}
                      alt={category.image.alt ?? ''}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <Icon name="leaf" className="text-leaf-600 size-6" />
                  )}
                </span>
                <span className="group-hover:text-brand-700 text-sm font-medium">
                  {localised(category, 'name', locale)}
                </span>
                {category.productCount != null ? (
                  <span className="text-ink-400 text-xs">{category.productCount} kinds</span>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* --- Rails ----------------------------------------------------------- */}
      {rails.loading ? (
        <div className="container-page py-8">
          <SkeletonCards count={4} />
        </div>
      ) : null}

      <ProductRail
        title="Best sellers"
        description="What people come back for."
        products={rails.data?.bestSellers ?? []}
        to="/shop?sort=popularity"
        locale={locale}
      />

      <ProductRail
        title="New on the shelf"
        products={rails.data?.newArrivals ?? []}
        to="/shop?sort=newest"
        locale={locale}
      />

      {/* --- Why us ---------------------------------------------------------- */}
      <section className="bg-white py-10 sm:py-14">
        <div className="container-page">
          <h2 className="mb-6 text-center text-xl sm:text-2xl">Why our achar</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {reasons.slice(0, 4).map((reason, index) => (
              <div key={reason.title ?? index} className="text-center">
                <span className="bg-brand-50 text-brand-700 mx-auto grid size-12 place-items-center rounded-full">
                  <Icon name={reason.icon || 'leaf'} className="size-6" />
                </span>
                <h3 className="mt-3 text-base">{localised(reason, 'title', locale)}</h3>
                <p className="text-ink-500 mt-1 text-sm">
                  {localised(reason, 'description', locale)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- On sale --------------------------------------------------------- */}
      {rails.data?.onSale?.length ? (
        <section className="container-page py-8 sm:py-10">
          <div className="border-brand-200 bg-brand-50 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
            <div>
              <h2 className="text-brand-900 text-xl">On offer right now</h2>
              <p className="text-brand-800 mt-0.5 text-sm">
                Same jars, smaller price. While the batch lasts.
              </p>
            </div>
            <Link to="/shop?onSale=true" className="btn-primary btn-sm shrink-0">
              See every offer
            </Link>
          </div>
          <ProductGrid products={rails.data.onSale.slice(0, 4)} locale={locale} />
        </section>
      ) : null}

      {/* --- Testimonials ---------------------------------------------------- */}
      {homepage.showTestimonials !== false && testimonials.length ? (
        <section className="bg-white py-10 sm:py-14">
          <div className="container-page">
            <h2 className="mb-6 text-center text-xl sm:text-2xl">What people say</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {testimonials.slice(0, 3).map((entry, index) => (
                <figure key={`${entry.name}-${index}`} className="card p-4">
                  <Icon name="star" className="text-mustard-400 size-4" fill="currentColor" />
                  <blockquote className="text-ink-700 mt-2 text-sm">“{entry.quote}”</blockquote>
                  <figcaption className="text-ink-500 mt-3 text-xs">
                    <span className="text-ink-800 font-medium">{entry.name}</span>
                    {entry.location ? ` · ${entry.location}` : null}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* --- Blog ------------------------------------------------------------ */}
      {homepage.showBlogSection !== false ? <LatestPosts locale={locale} /> : null}

      {/* --- Closing CTA ----------------------------------------------------- */}
      <section className="bg-ink-800 py-12 text-center">
        <div className="container-page">
          <h2 className="text-2xl text-white sm:text-3xl">Ready for a jar?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-cream-200">
            Pick your heat, pick your size. We pack it the day it ships.
          </p>
          <Link to="/shop" className="btn btn-lg mt-5 bg-white text-ink-900 hover:bg-cream-100">
            Shop all achar
            <Icon name="arrowRight" className="size-5" />
          </Link>
        </div>
      </section>
    </>
  );
}

/** Its own component so a slow blog query cannot hold up the rest of the page. */
function LatestPosts({ locale }) {
  const { data } = useFetch('/blog/latest');
  const posts = data?.posts ?? [];
  if (!posts.length) return null;

  return (
    <section className="container-page py-8 sm:py-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 className="text-xl sm:text-2xl">From the kitchen</h2>
        <Link to="/blog" className="btn-ghost btn-sm shrink-0">
          All posts
          <Icon name="arrowRight" className="size-4" />
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {posts.slice(0, 3).map((post) => (
          <article key={post._id} className="card overflow-hidden">
            <Link to={`/blog/${post.slug}`} className="block">
              {post.coverImage?.url ? (
                <img
                  src={post.coverImage.url}
                  alt={post.coverImage.alt ?? ''}
                  loading="lazy"
                  className="aspect-16/9 w-full object-cover"
                />
              ) : null}
              <div className="p-3">
                <p className="text-brand-700 text-xs font-medium">{post.category}</p>
                <h3 className="mt-1 text-base leading-snug">{localised(post, 'title', locale)}</h3>
                {post.excerpt ? (
                  <p className="text-ink-500 mt-1 line-clamp-2 text-sm">{post.excerpt}</p>
                ) : null}
              </div>
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
