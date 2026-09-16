import { Link } from 'react-router-dom';
import Icon from '../components/ui/Icon';
import { Skeleton } from '../components/ui/Spinner';
import EmptyState, { ErrorState } from '../components/ui/EmptyState';
import { useSettings } from '../context/SettingsContext';
import { useFetch } from '../hooks/useApi';
import useSeo from '../hooks/useSeo';
import { localised } from '../lib/format';
import { breadcrumbJsonLd } from '../lib/seo';

/**
 * The kinds of achar we make.
 *
 * `?tree=true` returns roots with their children nested one level deep, which is exactly
 * what this page draws: a card per kind, with its sub-kinds as links underneath. Building
 * the tree in the browser from the flat list would duplicate logic the server already has,
 * and the server also knows `productCount`.
 *
 * Every card links into `/category/:slug`, which is `Shop` with a starting filter - there
 * is no separate category screen to keep in step with the shop's own.
 */
export default function Categories() {
  const { locale } = useSettings();
  const { data, error, loading, refetch } = useFetch('/categories', { params: { tree: 'true' } });

  const categories = data?.categories ?? [];

  useSeo({
    title: 'Kinds of achar',
    description:
      'Mango, chilli, lemon, gundruk, mixed and seasonal special pickles — browse by kind and find the heat you like.',
    canonical: '/categories',
    structuredData: breadcrumbJsonLd([
      { name: 'Home', url: '/' },
      { name: 'Categories', url: '/categories' },
    ]),
  });

  return (
    <div className="container-page py-6 sm:py-8">
      <nav aria-label="Breadcrumb" className="text-ink-400 mb-3 flex items-center gap-1 text-xs">
        <Link to="/" className="hover:text-brand-700">
          Home
        </Link>
        <Icon name="chevronRight" className="size-3" />
        <span className="text-ink-600">Categories</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl">Every kind of achar</h1>
        <p className="text-ink-500 mt-1 max-w-prose text-sm">
          Sorted the way a Nepali kitchen thinks about it — by what goes in the jar. If you
          would rather filter by heat or price, the{' '}
          <Link to="/shop" className="text-brand-700 underline">
            full shop
          </Link>{' '}
          does that.
        </p>
      </header>

      {error ? <ErrorState error={error} onRetry={refetch} /> : null}

      {!error && loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : null}

      {!error && !loading && !categories.length ? (
        <div className="card">
          <EmptyState
            icon="box"
            title="No categories yet"
            description="The catalogue is still being set up. Everything we have is in the shop."
            action="Shop everything"
            actionTo="/shop"
          />
        </div>
      ) : null}

      {!error && !loading && categories.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <CategoryCard key={category._id} category={category} locale={locale} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CategoryCard({ category, locale }) {
  const name = localised(category, 'name', locale);
  const image = category.image?.url;
  const children = category.children ?? [];

  return (
    <li className="card group relative flex flex-col overflow-hidden">
      <div className="bg-cream-200 relative aspect-[16/9] overflow-hidden">
        {image ? (
          <img
            src={image}
            alt={category.image?.alt ?? name}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <span className="text-brand-300 flex size-full items-center justify-center">
            {/* The admin can set an emoji icon; the leaf is the fallback. */}
            {category.icon ? (
              <span className="text-4xl not-italic">{category.icon}</span>
            ) : (
              <Icon name="leaf" className="size-10" />
            )}
          </span>
        )}
        {category.productCount ? (
          <span className="badge absolute top-2 right-2 bg-white/90 text-ink-700 backdrop-blur">
            {category.productCount} {category.productCount === 1 ? 'jar' : 'jars'}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h2 className="text-base font-semibold">
          {/*
            The heading is the link and it is stretched over the card, so the sub-category
            links below stay separately clickable instead of being swallowed by an anchor
            wrapped around everything.
          */}
          <Link
            to={`/category/${category.slug}`}
            className="hover:text-brand-700 after:absolute after:inset-0 after:content-['']"
          >
            {name}
          </Link>
        </h2>

        {category.description ? (
          <p className="text-ink-500 mt-1 line-clamp-2 text-sm">{category.description}</p>
        ) : null}

        {children.length ? (
          <div className="relative mt-3 flex flex-wrap gap-1.5">
            {children.map((child) => (
              <Link
                key={child._id}
                to={`/category/${child.slug}`}
                className="border-cream-300 hover:border-brand-300 hover:bg-brand-50 rounded-full border bg-white px-2.5 py-1 text-xs"
              >
                {localised(child, 'name', locale)}
              </Link>
            ))}
          </div>
        ) : null}

        <span className="text-brand-700 mt-auto inline-flex items-center gap-1 pt-3 text-sm font-medium">
          Browse
          <Icon name="arrowRight" className="size-4" />
        </span>
      </div>
    </li>
  );
}
