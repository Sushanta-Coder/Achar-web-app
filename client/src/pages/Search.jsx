import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../components/ui/Icon';
import { SkeletonCards } from '../components/ui/Spinner';
import EmptyState, { ErrorState } from '../components/ui/EmptyState';
import { ProductGrid } from '../components/shop/ProductCard';
import { Pagination } from '../components/admin/AdminPage';
import { useSettings } from '../context/SettingsContext';
import { useDebounced, useFetch } from '../hooks/useApi';
import useSeo from '../hooks/useSeo';
import { localised } from '../lib/format';

/**
 * Search results.
 *
 * `?q=` in the URL is the state, same as the shop - so a result page can be shared, and
 * the back button works through a series of searches. The box holds its own draft value
 * while typing and only writes to the URL on submit or on picking a suggestion; writing
 * every keystroke into history would make the back button useless.
 *
 * `noIndex` is deliberate and important: an indexed `?q=` page is textbook thin content,
 * and a crawler that finds one will happily crawl thousands.
 *
 * Suggestions come from `/products/suggestions`, which returns nothing under two
 * characters, so there is no request to make until then either.
 */

const SORTS = [
  { value: '', label: 'Best match' },
  { value: 'popularity', label: 'Most popular' },
  { value: 'newest', label: 'Newest first' },
  { value: 'price-low', label: 'Price: low to high' },
  { value: 'price-high', label: 'Price: high to low' },
  { value: 'rating', label: 'Best rated' },
];

export default function Search() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { locale } = useSettings();

  const query = params.get('q') ?? '';
  const sort = params.get('sort') ?? '';
  const page = Number(params.get('page') ?? 1);

  const [draft, setDraft] = useState(query);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  // Keep the box in step when the URL changes underneath it - a suggestion click, the
  // back button, or a search started from the header.
  useEffect(() => setDraft(query), [query]);

  useEffect(() => {
    const onClickAway = (event) => {
      if (!boxRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, []);

  const debounced = useDebounced(draft, 250);

  const results = useFetch('/products/search', {
    params: { q: query, page, limit: 12, ...(sort ? { sort } : {}) },
    skip: !query,
  });

  const suggestions = useFetch('/products/suggestions', {
    params: { q: debounced },
    // Under two characters the endpoint answers with empty arrays, so there is nothing
    // worth asking for.
    skip: !open || debounced.trim().length < 2 || debounced === query,
  });

  useSeo({
    title: query ? `Search: ${query}` : 'Search',
    description: 'Search our achar by name, ingredient or kind.',
    noIndex: true,
  });

  const products = results.data?.products ?? [];
  const total = results.data?.meta?.total;

  const run = (value, extra = {}) => {
    const next = new URLSearchParams();
    if (value) next.set('q', value);
    if (extra.sort ?? sort) next.set('sort', extra.sort ?? sort);
    if (extra.page && extra.page > 1) next.set('page', String(extra.page));
    setParams(next);
    setOpen(false);
  };

  const suggestedProducts = suggestions.data?.products ?? [];
  const suggestedCategories = suggestions.data?.categories ?? [];
  const showSuggestions =
    open && (suggestedProducts.length > 0 || suggestedCategories.length > 0);

  return (
    <div className="container-page py-6 sm:py-8">
      <h1 className="text-2xl sm:text-3xl">Search</h1>

      <div ref={boxRef} className="relative mt-4 max-w-xl">
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            run(draft.trim());
          }}
        >
          <label htmlFor="search-q" className="sr-only">
            What are you looking for?
          </label>
          <div className="relative">
            <Icon
              name="search"
              className="text-ink-400 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <input
              id="search-q"
              type="search"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              autoComplete="off"
              placeholder="Mango achar, gundruk, extra hot…"
              className="field-input pl-9"
            />
          </div>
        </form>

        {showSuggestions ? (
          <div className="border-cream-300 absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border bg-white shadow-lg">
            {suggestedProducts.length ? (
              <ul className="divide-cream-200 divide-y">
                {suggestedProducts.map((product) => (
                  <li key={product._id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/product/${product.slug}`)}
                      className="hover:bg-cream-100 flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left"
                    >
                      <span className="bg-cream-200 size-9 shrink-0 overflow-hidden rounded">
                        {product.thumbnail?.url ? (
                          <img
                            src={product.thumbnail.url}
                            alt=""
                            className="size-full object-cover"
                            loading="lazy"
                          />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {localised(product, 'name', locale)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {suggestedCategories.length ? (
              <div className="border-cream-200 bg-cream-50 flex flex-wrap gap-1.5 border-t p-2">
                {suggestedCategories.map((category) => (
                  <Link
                    key={category._id}
                    to={`/category/${category.slug}`}
                    onClick={() => setOpen(false)}
                    className="border-cream-300 rounded-full border bg-white px-2.5 py-1 text-xs"
                  >
                    {localised(category, 'name', locale)}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* --- No query yet ------------------------------------------------- */}
      {!query ? (
        <div className="card mt-6">
          <EmptyState
            icon="search"
            title="What are you after?"
            description="Search by name, by ingredient, or just by how hot you want it."
            action="Or browse everything"
            actionTo="/shop"
          />
        </div>
      ) : null}

      {/* --- Results ------------------------------------------------------ */}
      {query ? (
        <div className="mt-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-ink-500 text-sm">
              {results.loading
                ? 'Looking…'
                : total != null
                  ? `${total} ${total === 1 ? 'result' : 'results'} for “${query}”`
                  : `Results for “${query}”`}
            </p>

            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="search-sort">
                Sort results
              </label>
              <select
                id="search-sort"
                value={sort}
                onChange={(event) => run(query, { sort: event.target.value })}
                className="field-input min-h-10 w-auto text-sm"
              >
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {results.error ? <ErrorState error={results.error} onRetry={results.refetch} /> : null}

          {!results.error && results.loading ? <SkeletonCards count={8} /> : null}

          {!results.error && !results.loading && !products.length ? (
            <div className="card">
              <EmptyState
                icon="search"
                title={`Nothing matched “${query}”`}
                description="Try a shorter word — “mango” finds more than “mango pickle 500g” does. Or have a look at the kinds we make."
                action="Browse by kind"
                actionTo="/categories"
                secondary={
                  <Link to="/shop" className="btn-outline">
                    Shop everything
                  </Link>
                }
              />
            </div>
          ) : null}

          {!results.error && !results.loading && products.length ? (
            <>
              <ProductGrid products={products} locale={locale} />
              <Pagination
                meta={results.data?.meta}
                onPage={(next) => run(query, { page: next })}
                className="mt-6"
              />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
