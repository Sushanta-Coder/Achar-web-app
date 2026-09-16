import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import EmptyState, { ErrorState } from '../../components/ui/EmptyState';
import Spinner, { SkeletonRows } from '../../components/ui/Spinner';
import { StockBadge } from '../../components/admin/StatusBadge';
import { FilterBar, Modal, PageHeader, Pagination, TabBar } from '../../components/admin/AdminPage';
import { useDebounced, useFetch, useMutation } from '../../hooks/useApi';
import { del, post } from '../../lib/apiClient';
import { useToast } from '../../context/ToastContext';
import useSeo from '../../hooks/useSeo';
import { formatDate, formatPrice } from '../../lib/format';

/**
 * Product catalogue.
 *
 * Bulk activate/deactivate is here rather than only on the edit form because seasonal
 * lines go off sale in groups - all the lapsi products at once when the fruit is out of
 * season, not one at a time.
 *
 * Delete is soft when a product has been sold: the API deactivates it instead and says
 * so, because an order line must always resolve back to the product it was sold from.
 * The confirm dialog says that up front so it is not a surprise.
 */

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Hidden' },
];

export default function AdminProducts() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debouncedSearch = useDebounced(search);
  const [selected, setSelected] = useState(() => new Set());
  const [pendingDelete, setPendingDelete] = useState(null);
  const toast = useToast();

  useSeo({ title: 'Products · Admin', noIndex: true });

  const status = params.get('status') ?? 'all';
  const page = Number(params.get('page') ?? 1);

  const setFilter = (patch, { keepPage = false } = {}) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (!value || value === 'all') next.delete(key);
      else next.set(key, String(value));
    }
    if (!keepPage) next.delete('page');
    setParams(next, { replace: true });
    setSelected(new Set());
  };

  const query = useMemo(() => {
    const built = { page, limit: 20, status };
    if (params.get('category')) built.category = params.get('category');
    if (params.get('sort')) built.sort = params.get('sort');
    if (debouncedSearch.trim()) built.q = debouncedSearch.trim();
    return built;
  }, [page, status, params, debouncedSearch]);

  const { data, loading, error, refetch } = useFetch('/products/admin/list', { params: query });
  const categories = useFetch('/categories', { params: { includeInactive: true } });

  const products = data?.products ?? [];

  const bulk = useMutation((body) => post('/products/admin/bulk-status', body), {
    onSuccess: (result) => {
      toast.success(`${result.modified} product(s) updated`);
      setSelected(new Set());
      refetch();
    },
    onError: (normalised) => toast.error(normalised.message),
  });

  const remove = useMutation((productId) => del(`/products/admin/${productId}`), {
    onSuccess: () => {
      setPendingDelete(null);
      refetch();
    },
    onError: (normalised) => toast.error(normalised.message),
  });

  const toggleOne = (productId) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });

  const allOnPageSelected = products.length > 0 && products.every((item) => selected.has(item._id));

  const confirmDelete = async () => {
    try {
      // The API decides whether this is a delete or a deactivation; it tells us which,
      // so the toast reflects what actually happened rather than what we assumed.
      const result = await remove.run(pendingDelete._id);
      toast.success(
        result.deactivated
          ? 'This product has been sold before, so it was hidden instead of deleted'
          : 'Product deleted'
      );
    } catch {
      /* reported by onError */
    }
  };

  return (
    <>
      <PageHeader
        title="Products"
        description="Your catalogue. Each product holds one or more sizes, priced individually."
        actions={
          <Link to="/admin/products/new" className="btn-primary btn-sm">
            <Icon name="plus" className="size-4" />
            New product
          </Link>
        }
      />

      <TabBar tabs={STATUS_TABS} active={status} onChange={(value) => setFilter({ status: value })} />

      <FilterBar
        value={search}
        onChange={setSearch}
        placeholder="Name or SKU…"
        onReset={search || params.get('category') ? () => { setSearch(''); setFilter({ q: '', category: '' }); } : undefined}
      >
        <select
          aria-label="Category"
          value={params.get('category') ?? ''}
          onChange={(event) => setFilter({ category: event.target.value })}
          className="field-input min-h-10 w-auto text-sm"
        >
          <option value="">All categories</option>
          {(categories.data?.categories ?? []).map((category) => (
            <option key={category._id} value={category.slug}>
              {category.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Sort"
          value={params.get('sort') ?? ''}
          onChange={(event) => setFilter({ sort: event.target.value })}
          className="field-input min-h-10 w-auto text-sm"
        >
          <option value="">Default order</option>
          <option value="newest">Newest</option>
          <option value="price-low">Price: low to high</option>
          <option value="price-high">Price: high to low</option>
          <option value="popularity">Best selling</option>
        </select>
      </FilterBar>

      {selected.size ? (
        <div className="bg-ink-800 mb-3 flex flex-wrap items-center gap-2 rounded-xl px-3.5 py-2.5 text-white">
          <p className="text-sm font-medium">
            {selected.size} selected
          </p>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={bulk.pending}
              onClick={() => bulk.run({ ids: [...selected], isActive: true })}
              className="btn btn-sm bg-white/15 text-white hover:bg-white/25"
            >
              Show on shop
            </button>
            <button
              type="button"
              disabled={bulk.pending}
              onClick={() => bulk.run({ ids: [...selected], isActive: false })}
              className="btn btn-sm bg-white/15 text-white hover:bg-white/25"
            >
              Hide
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="btn-ghost btn-sm text-cream-300 hover:text-white"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      {error ? <ErrorState error={error} onRetry={refetch} /> : null}

      {!error && loading ? (
        <div className="card p-4">
          <SkeletonRows rows={8} columns={6} />
        </div>
      ) : null}

      {!error && !loading && !products.length ? (
        <div className="card">
          <EmptyState
            icon="box"
            title={search ? 'Nothing matched that' : 'No products yet'}
            description={
              search
                ? 'Try a shorter search, or check the status tab.'
                : 'Add your first achar and it will appear on the shop straight away.'
            }
            action={search ? undefined : 'Add a product'}
            actionTo={search ? undefined : '/admin/products/new'}
          />
        </div>
      ) : null}

      {!error && !loading && products.length ? (
        <>
          <div className="card overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col" className="w-10">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={() =>
                        setSelected(allOnPageSelected ? new Set() : new Set(products.map((p) => p._id)))
                      }
                      aria-label="Select all on this page"
                      className="size-4 cursor-pointer"
                    />
                  </th>
                  <th scope="col">Product</th>
                  <th scope="col" className="hidden sm:table-cell">
                    Category
                  </th>
                  <th scope="col">Price</th>
                  <th scope="col">Stock</th>
                  <th scope="col" className="hidden lg:table-cell">
                    Sold
                  </th>
                  <th scope="col">Visible</th>
                  <th scope="col" className="sr-only">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product._id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(product._id)}
                        onChange={() => toggleOne(product._id)}
                        aria-label={`Select ${product.name}`}
                        className="size-4 cursor-pointer"
                      />
                    </td>

                    <td>
                      <div className="flex items-center gap-2.5">
                        {product.thumbnail ? (
                          <img
                            src={product.thumbnail}
                            alt=""
                            loading="lazy"
                            className="bg-cream-200 size-10 shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <span className="bg-cream-200 text-ink-400 grid size-10 shrink-0 place-items-center rounded-lg">
                            <Icon name="box" className="size-5" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <Link
                            to={`/admin/products/${product._id}/edit`}
                            className="text-ink-900 hover:text-brand-700 block truncate font-medium"
                          >
                            {product.name}
                          </Link>
                          <p className="text-ink-400 text-xs">
                            {product.sku} · {product.variants?.length ?? 0} size
                            {(product.variants?.length ?? 0) === 1 ? '' : 's'}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="text-ink-500 hidden text-xs sm:table-cell">
                      {product.category?.name ?? '—'}
                    </td>

                    <td className="tnum whitespace-nowrap">
                      {formatPrice(product.minPrice)}
                      {product.maxPrice > product.minPrice ? (
                        <span className="text-ink-400"> – {formatPrice(product.maxPrice)}</span>
                      ) : null}
                    </td>

                    <td>
                      <StockBadge available={product.totalStock ?? 0} />
                    </td>

                    <td className="tnum text-ink-500 hidden text-xs lg:table-cell">
                      {product.soldCount ?? 0}
                    </td>

                    <td>
                      {product.isActive ? (
                        <span className="badge border-leaf-200 bg-leaf-100 text-leaf-800 border">
                          Live
                        </span>
                      ) : (
                        <span className="badge border-cream-400 bg-cream-200 text-ink-600 border">
                          Hidden
                        </span>
                      )}
                    </td>

                    <td>
                      <div className="flex items-center justify-end gap-0.5">
                        <Link
                          to={`/product/${product.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-ghost btn-sm size-8 px-0"
                          title="View on shop"
                        >
                          <Icon name="external" className="size-4" />
                        </Link>
                        <Link
                          to={`/admin/products/${product._id}/edit`}
                          className="btn-ghost btn-sm size-8 px-0"
                          title="Edit"
                        >
                          <Icon name="edit" className="size-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(product)}
                          className="btn-ghost btn-sm size-8 px-0 text-red-600"
                          title="Delete"
                        >
                          <Icon name="trash" className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            meta={data.meta}
            onPage={(next) => setFilter({ page: next }, { keepPage: true })}
            className="mt-4"
          />
        </>
      ) : null}

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="Delete this product?"
        size="sm"
        footer={
          <>
            <button type="button" onClick={() => setPendingDelete(null)} className="btn-outline btn-sm">
              Keep it
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={remove.pending}
              className="btn btn-sm bg-red-600 text-white hover:bg-red-700"
            >
              {remove.pending ? <Spinner className="size-4" /> : null}
              Delete
            </button>
          </>
        }
      >
        <p className="text-ink-600 text-sm">
          <strong className="text-ink-900">{pendingDelete?.name}</strong> will be removed from the
          shop.
        </p>
        <p className="text-ink-500 mt-2 text-sm">
          If it has ever been ordered it is hidden instead of deleted, so past orders keep working.
          Last updated {formatDate(pendingDelete?.updatedAt)}.
        </p>
      </Modal>
    </>
  );
}
