import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Icon from '../components/ui/Icon';
import EmptyState, { ErrorState } from '../components/ui/EmptyState';
import { SkeletonCards } from '../components/ui/Spinner';
import { ProductGrid } from '../components/shop/ProductCard';
import { Pagination } from '../components/admin/AdminPage';
import { useFetch } from '../hooks/useApi';
import { useSettings } from '../context/SettingsContext';
import useSeo from '../hooks/useSeo';
import { formatPrice, localised } from '../lib/format';
import { breadcrumbJsonLd } from '../lib/seo';

/**
 * Shop, and the category landing pages.
 *
 * One component for both because they are the same screen with a different starting filter.
 * `/category/:slug` reads the category from the URL segment and hides the category facet
 * (you are already in it); `/shop` shows everything and offers the facet. Splitting them
 * would mean maintaining two copies of a filter sidebar.
 *
 * **The URL is the state.** Every filter lives in the query string, so a filtered shop can
 * be bookmarked, shared and reached with the back button, and the fetch hook re-runs from
 * the same source the UI renders from. There is no local mirror of the filters to drift out
 * of sync.
 *
 * Facets come from `/products/facets` with the same query, so the counts describe what the
 * current filters would actually return rather than the whole catalogue.
 */

const SORTS = [
  { value: 'popularity', label: 'Most popular' },
  { value: 'newest', label: 'Newest first' },
  { value: 'price-low', label: 'Price: low to high' },
  { value: 'price-high', label: 'Price: high to low' },
  { value: 'rating', label: 'Best rated' },
  { value: 'name', label: 'Name A–Z' },
];

const SPICE_LABELS = {
  mild: 'Mild',
  medium: 'Medium',
  hot: 'Hot',
  'extra-hot': 'Extra hot',
};

export default function Shop() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { locale } = useSettings();

  const isCategoryPage = Boolean(slug);

  // Read straight from the URL — no local copy to keep in step.
  const page = Number(params.get('page') ?? 1);
  const sort = params.get('sort') ?? '';
  const category = params.get('category') ?? '';
  const spiceLevel = params.get('spiceLevel') ?? '';
  const minPrice = params.get('minPrice') ?? '';
  const maxPrice = params.get('maxPrice') ?? '';
  const rating = params.get('rating') ?? '';
  const inStock = params.get('inStock') === 'true';
  const onSale = params.get('onSale') === 'true';
  const vegetarian = params.get('vegetarian') === 'true';

  const query = {
    page,
    limit: 12,
    ...(sort ? { sort } : {}),
    ...(category && !isCategoryPage ? { category } : {}),
    ...(spiceLevel ? { spiceLevel } : {}),
    ...(minPrice ? { minPrice } : {}),
    ...(maxPrice ? { maxPrice } : {}),
    ...(rating ? { rating } : {}),
    ...(inStock ? { inStock: 'true' } : {}),
    ...(onSale ? { onSale: 'true' } : {}),
    ...(vegetarian ? { vegetarian: 'true' } : {}),
  };

  // The category page has its own endpoint: it returns the category, its children and the
  // first page of products together, so the heading does not need a second request.
  const listUrl = isCategoryPage ? `/categories/${slug}` : '/products';
  const list = useFetch(listUrl, { params: query, deps: [slug] });
  const facets = useFetch('/products/facets', {
    params: isCategoryPage ? { ...query, category: slug } : query,
    deps: [slug],
  });

  const setFilter = (patchValues, { keepPage = false } = {}) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patchValues)) {
      if (value === '' || value == null || value === false) next.delete(key);
      else next.set(key, String(value));
    }
    if (!keepPage) next.delete('page');
    setParams(next, { replace: true });
  };

  const clearAll = () => setParams(sort ? new URLSearchParams({ sort }) : new URLSearchParams());

  const products = list.data?.products ?? [];
  const activeCategory = list.data?.category;
  const children = list.data?.children ?? [];
  // `request()` attaches the envelope's `meta` onto the unwrapped data object.
  const total = list.data?.meta?.total;

  const activeCount = [category, spiceLevel, minPrice, maxPrice, rating].filter(Boolean).length +
    [inStock, onSale, vegetarian].filter(Boolean).length;

  const title = activeCategory ? localised(activeCategory, 'name', locale) : 'All achar';

  useSeo({
    title: activeCategory?.seo?.metaTitle || title,
    description:
      activeCategory?.seo?.metaDescription ||
      activeCategory?.description ||
      'Browse every jar we make — filter by heat, size and price.',
    canonical: isCategoryPage ? `/category/${slug}` : '/shop',
    // Only the first page is canonical-worthy on its own; deeper pages are noindexed so
    // Google does not treat page 7 of a filter as a separate thin page.
    noIndex: page > 1 || activeCount > 0,
    structuredData: breadcrumbJsonLd(
      isCategoryPage
        ? [
            { name: 'Home', url: '/' },
            { name: 'Shop', url: '/shop' },
            { name: title, url: `/category/${slug}` },
          ]
        : [
            { name: 'Home', url: '/' },
            { name: 'Shop', url: '/shop' },
          ]
    ),
  });

  const sidebar = (
    <FilterPanel
      facets={facets.data}
      hideCategories={isCategoryPage}
      values={{ category, spiceLevel, minPrice, maxPrice, rating, inStock, onSale, vegetarian }}
      onChange={setFilter}
      onClear={clearAll}
      activeCount={activeCount}
    />
  );

  return (
    <div className="container-page py-6 sm:py-8">
      <nav aria-label="Breadcrumb" className="text-ink-400 mb-3 flex items-center gap-1 text-xs">
        <Link to="/" className="hover:text-brand-700">
          Home
        </Link>
        <Icon name="chevronRight" className="size-3" />
        {isCategoryPage ? (
          <>
            <Link to="/shop" className="hover:text-brand-700">
              Shop
            </Link>
            <Icon name="chevronRight" className="size-3" />
            <span className="text-ink-600">{title}</span>
          </>
        ) : (
          <span className="text-ink-600">Shop</span>
        )}
      </nav>

      <header className="mb-5">
        <h1 className="text-2xl sm:text-3xl">{title}</h1>
        {activeCategory?.description ? (
          <p className="text-ink-500 mt-1 max-w-prose text-sm">{activeCategory.description}</p>
        ) : (
          <p className="text-ink-500 mt-1 text-sm">
            Every jar we make, from mild to the kind that needs a glass of water nearby.
          </p>
        )}
      </header>

      {/* Sub-categories, when the category has any. Cheaper to scan than the facet list. */}
      {children.length ? (
        <div className="mb-5 flex flex-wrap gap-2">
          {children.map((child) => (
            <Link
              key={child._id}
              to={`/category/${child.slug}`}
              className="border-cream-300 hover:border-brand-300 hover:bg-brand-50 rounded-full border bg-white px-3 py-1.5 text-sm"
            >
              {localised(child, 'name', locale)}
              {child.productCount ? (
                <span className="text-ink-400 ml-1 text-xs">{child.productCount}</span>
              ) : null}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="lg:grid lg:grid-cols-[16rem_1fr] lg:gap-8">
        {/* Sidebar on desktop; the same panel in a sheet on mobile. */}
        <aside className="hidden lg:block">{sidebar}</aside>

        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-ink-500 text-sm">
              {list.loading
                ? 'Looking…'
                : total != null
                  ? `${total} ${total === 1 ? 'jar' : 'jars'}`
                  : `${products.length} shown`}
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="btn-outline btn-sm lg:hidden"
              >
                <Icon name="filter" className="size-4" />
                Filters
                {activeCount ? (
                  <span className="bg-brand-600 tnum rounded-full px-1.5 text-xs text-white">
                    {activeCount}
                  </span>
                ) : null}
              </button>

              <label className="sr-only" htmlFor="shop-sort">
                Sort by
              </label>
              <select
                id="shop-sort"
                value={sort}
                onChange={(event) => setFilter({ sort: event.target.value })}
                className="field-input min-h-10 w-auto text-sm"
              >
                <option value="">Sort: most popular</option>
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {activeCount ? (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {spiceLevel ? (
                <Chip onRemove={() => setFilter({ spiceLevel: '' })}>
                  {SPICE_LABELS[spiceLevel] ?? spiceLevel}
                </Chip>
              ) : null}
              {minPrice || maxPrice ? (
                <Chip onRemove={() => setFilter({ minPrice: '', maxPrice: '' })}>
                  {minPrice ? formatPrice(minPrice) : 'Any'} – {maxPrice ? formatPrice(maxPrice) : 'Any'}
                </Chip>
              ) : null}
              {rating ? (
                <Chip onRemove={() => setFilter({ rating: '' })}>{rating}★ and up</Chip>
              ) : null}
              {inStock ? <Chip onRemove={() => setFilter({ inStock: false })}>In stock</Chip> : null}
              {onSale ? <Chip onRemove={() => setFilter({ onSale: false })}>On offer</Chip> : null}
              {vegetarian ? (
                <Chip onRemove={() => setFilter({ vegetarian: false })}>Vegetarian</Chip>
              ) : null}
              <button type="button" onClick={clearAll} className="text-brand-700 text-sm underline">
                Clear all
              </button>
            </div>
          ) : null}

          {list.error ? <ErrorState error={list.error} onRetry={list.refetch} /> : null}

          {!list.error && list.loading ? <SkeletonCards count={8} /> : null}

          {!list.error && !list.loading && !products.length ? (
            <div className="card">
              <EmptyState
                icon="search"
                title="Nothing matches that"
                description={
                  activeCount
                    ? 'Try widening the filters — the price range or the heat level is usually the culprit.'
                    : 'There is nothing in this part of the shop yet. Have a look at everything instead.'
                }
                action={
                  activeCount ? (
                    <button type="button" onClick={clearAll} className="btn-primary btn-sm">
                      Clear the filters
                    </button>
                  ) : (
                    <Link to="/shop" className="btn-primary btn-sm">
                      Shop everything
                    </Link>
                  )
                }
              />
            </div>
          ) : null}

          {!list.error && !list.loading && products.length ? (
            <>
              <ProductGrid products={products} locale={locale} />
              <Pagination
                meta={list.data?.meta}
                onPage={(next) => setFilter({ page: next }, { keepPage: true })}
                className="mt-6"
              />
            </>
          ) : null}
        </div>
      </div>

      {/* Mobile filter sheet. Rendered only when open so it is not in the tab order. */}
      {filtersOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setFiltersOpen(false)}
            className="bg-ink-900/40 absolute inset-0"
          />
          <div className="animate-fade-up absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg">Filters</h2>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="btn-ghost btn-sm size-9 px-0"
                aria-label="Close filters"
              >
                <Icon name="close" className="size-5" />
              </button>
            </div>
            {sidebar}
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="btn-primary mt-4 w-full justify-center"
            >
              Show {total ?? products.length} results
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Chip({ children, onRemove }) {
  return (
    <span className="border-cream-300 inline-flex items-center gap-1 rounded-full border bg-white px-2.5 py-1 text-xs">
      {children}
      <button
        type="button"
        onClick={onRemove}
        className="text-ink-400 hover:text-brand-700 cursor-pointer"
        aria-label="Remove this filter"
      >
        <Icon name="close" className="size-3" />
      </button>
    </span>
  );
}

function FilterPanel({ facets, values, onChange, onClear, hideCategories, activeCount }) {
  const { locale } = useSettings();
  const priceRange = facets?.priceRange ?? { min: 0, max: 0 };

  return (
    <div className="space-y-4">
      {activeCount ? (
        <button type="button" onClick={onClear} className="btn-outline btn-sm w-full justify-center">
          Clear {activeCount} filter{activeCount === 1 ? '' : 's'}
        </button>
      ) : null}

      {!hideCategories && facets?.categories?.length ? (
        <Group title="Kind">
          <ul className="space-y-1">
            {facets.categories.map((entry) => (
              <li key={entry._id}>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="shop-category"
                    checked={values.category === entry.slug}
                    onChange={() => onChange({ category: entry.slug })}
                    className="size-4 cursor-pointer"
                  />
                  <span className="flex-1">{localised(entry, 'name', locale)}</span>
                  <span className="text-ink-400 tnum text-xs">{entry.count}</span>
                </label>
              </li>
            ))}
          </ul>
        </Group>
      ) : null}

      {facets?.spiceLevels?.length ? (
        <Group title="Heat">
          <ul className="space-y-1">
            {facets.spiceLevels.map((entry) => (
              <li key={entry.level}>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="shop-spice"
                    checked={values.spiceLevel === entry.level}
                    onChange={() => onChange({ spiceLevel: entry.level })}
                    className="size-4 cursor-pointer"
                  />
                  <span className="flex-1">{SPICE_LABELS[entry.level] ?? entry.level}</span>
                  <span className="text-ink-400 tnum text-xs">{entry.count}</span>
                </label>
              </li>
            ))}
          </ul>
        </Group>
      ) : null}

      <Group title="Price">
        {/*
          Two number inputs rather than a slider. A slider needs a drag library to be
          usable on touch, and on a catalogue this small typing a number is faster.
        */}
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="shop-min">
            Lowest price
          </label>
          <input
            id="shop-min"
            type="number"
            min={0}
            step={1}
            value={values.minPrice}
            onChange={(event) => onChange({ minPrice: event.target.value })}
            placeholder={String(priceRange.min || 0)}
            className="field-input tnum min-h-9 text-sm"
          />
          <span className="text-ink-400 text-sm">–</span>
          <label className="sr-only" htmlFor="shop-max">
            Highest price
          </label>
          <input
            id="shop-max"
            type="number"
            min={0}
            step={1}
            value={values.maxPrice}
            onChange={(event) => onChange({ maxPrice: event.target.value })}
            placeholder={String(priceRange.max || 0)}
            className="field-input tnum min-h-9 text-sm"
          />
        </div>
        {priceRange.max ? (
          <p className="field-hint">
            Jars run {formatPrice(priceRange.min)} to {formatPrice(priceRange.max)}.
          </p>
        ) : null}
      </Group>

      <Group title="Rating">
        <ul className="space-y-1">
          {[4, 3].map((stars) => (
            <li key={stars}>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="shop-rating"
                  checked={String(values.rating) === String(stars)}
                  onChange={() => onChange({ rating: stars })}
                  className="size-4 cursor-pointer"
                />
                {stars}★ and up
              </label>
            </li>
          ))}
        </ul>
      </Group>

      <Group title="Show only">
        <div className="space-y-1">
          <Toggle
            checked={values.inStock}
            onChange={(next) => onChange({ inStock: next })}
            count={facets?.flags?.inStock}
          >
            In stock
          </Toggle>
          <Toggle
            checked={values.onSale}
            onChange={(next) => onChange({ onSale: next })}
            count={facets?.flags?.onSale}
          >
            On offer
          </Toggle>
          <Toggle
            checked={values.vegetarian}
            onChange={(next) => onChange({ vegetarian: next })}
            count={facets?.flags?.vegetarian}
          >
            Vegetarian
          </Toggle>
        </div>
      </Group>
    </div>
  );
}

function Group({ title, children }) {
  return (
    <section className="border-cream-300 rounded-xl border bg-white p-3">
      <h3 className="text-ink-800 mb-2 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Toggle({ checked, onChange, count, children }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 cursor-pointer"
      />
      <span className="flex-1">{children}</span>
      {count != null ? <span className="text-ink-400 tnum text-xs">{count}</span> : null}
    </label>
  );
}
