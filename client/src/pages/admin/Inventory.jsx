import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import EmptyState, { ErrorState } from '../../components/ui/EmptyState';
import Spinner, { PageLoader } from '../../components/ui/Spinner';
import { StockBadge } from '../../components/admin/StatusBadge';
import { FilterBar, PageHeader, StatTile, TabBar } from '../../components/admin/AdminPage';
import { useDebounced, useFetch, useMutation } from '../../hooks/useApi';
import { patch, post } from '../../lib/apiClient';
import { useToast } from '../../context/ToastContext';
import useSeo from '../../hooks/useSeo';
import { formatNumber, formatPrice } from '../../lib/format';

/**
 * Inventory.
 *
 * The stock number is edited in place, and it is an absolute count rather than a delta -
 * you type what is on the shelf. `PATCH /admin/inventory/:productId/:variantId` takes
 * `{stock}` for exactly that reason: a "+5" sent twice by an impatient click would add ten,
 * whereas setting the count to 42 twice still means 42.
 *
 * Edits are collected and saved together via `POST /admin/inventory/bulk`, because a stock
 * count is a walk down the shelves, not one row at a time.
 *
 * Three numbers, deliberately kept separate:
 *  - `stock` is what exists.
 *  - `reservedStock` is held by unpaid orders.
 *  - `availableStock` is what a customer can actually buy.
 */

const STATUS_TABS = [
  { value: 'all', label: 'Everything' },
  { value: 'low-stock', label: 'Low' },
  { value: 'out-of-stock', label: 'Out' },
  { value: 'in-stock', label: 'In stock' },
];

export default function AdminInventory() {
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  // Keyed `productId:variantId` so a value survives a refetch reordering the rows.
  const [drafts, setDrafts] = useState({});
  const toast = useToast();

  useSeo({ title: 'Inventory · Admin', noIndex: true });

  const query = useMemo(() => {
    const built = {};
    if (status !== 'all') built.status = status;
    if (debouncedSearch.trim()) built.q = debouncedSearch.trim();
    return built;
  }, [status, debouncedSearch]);

  const { data, loading, error, refetch } = useFetch('/admin/inventory', { params: query });

  const items = data?.items ?? [];
  const dirtyKeys = Object.keys(drafts);

  const saveAll = useMutation(
    () =>
      post('/admin/inventory/bulk', {
        updates: dirtyKeys.map((key) => {
          const [productId, variantId] = key.split(':');
          return { productId, variantId, stock: Number(drafts[key]) };
        }),
      }),
    {
      onSuccess: (result) => {
        toast.success(`${result.updated ?? dirtyKeys.length} size(s) updated`);
        setDrafts({});
        refetch();
      },
      onError: (normalised) => toast.error(normalised.message),
    }
  );

  const saveOne = useMutation(
    ({ productId, variantId, stock }) =>
      patch(`/admin/inventory/${productId}/${variantId}`, { stock }),
    {
      onSuccess: (result) => toast.success(result.message ?? 'Stock updated'),
      onError: (normalised) => toast.error(normalised.message),
    }
  );

  const setDraft = (key, value) =>
    setDrafts((current) => {
      const next = { ...current };
      if (value === '') next[key] = '';
      else next[key] = value;
      return next;
    });

  const commitOne = async (row) => {
    const key = `${row.productId}:${row.variantId}`;
    const draft = drafts[key];
    if (draft === undefined || draft === '' || Number(draft) === row.stock) return;

    try {
      await saveOne.run({ productId: row.productId, variantId: row.variantId, stock: Number(draft) });
      setDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      refetch();
    } catch {
      /* reported by onError */
    }
  };

  if (loading && !data) return <PageLoader label="Loading inventory" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Type the count that is actually on the shelf. Reserved units are held by orders that have not been paid for yet."
        actions={
          <a href="/api/admin/export/inventory" className="btn-outline btn-sm">
            <Icon name="download" className="size-4" />
            Export CSV
          </a>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Out of stock"
          value={formatNumber(data?.counts?.['out-of-stock'] ?? 0)}
          sub="sizes with nothing left"
          icon="alert"
          tone="red"
        />
        <StatTile
          label="Low stock"
          value={formatNumber(data?.counts?.['low-stock'] ?? 0)}
          sub="at or below the warning level"
          icon="box"
          tone="mustard"
        />
        <StatTile
          label="Reserved"
          value={formatNumber(data?.reservedUnits ?? 0)}
          sub="held by unpaid orders"
          icon="clock"
          tone="ink"
        />
        <StatTile
          label="Stock value"
          value={formatPrice(data?.stockValue ?? 0)}
          sub="at list price"
          icon="wallet"
          tone="leaf"
        />
      </div>

      <TabBar tabs={STATUS_TABS} active={status} onChange={setStatus} counts={data?.counts} />

      <FilterBar
        value={search}
        onChange={setSearch}
        placeholder="Product name or SKU…"
        onReset={search ? () => setSearch('') : undefined}
      />

      {dirtyKeys.length ? (
        <div className="bg-ink-800 sticky top-2 z-30 mb-3 flex flex-wrap items-center gap-2 rounded-xl px-3.5 py-2.5 text-white">
          <p className="text-sm font-medium">
            {dirtyKeys.length} unsaved change{dirtyKeys.length === 1 ? '' : 's'}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDrafts({})}
              className="btn-ghost btn-sm text-cream-300 hover:text-white"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => saveAll.run()}
              disabled={saveAll.pending || dirtyKeys.some((key) => drafts[key] === '')}
              className="btn btn-sm bg-white text-ink-900 hover:bg-cream-100"
            >
              {saveAll.pending ? <Spinner className="size-4" /> : <Icon name="check" className="size-4" />}
              Save all
            </button>
          </div>
        </div>
      ) : null}

      {items.length ? (
        <div className="card overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Size</th>
                <th scope="col" className="hidden md:table-cell">
                  Price
                </th>
                <th scope="col" className="text-right">
                  On shelf
                </th>
                <th scope="col" className="hidden text-right sm:table-cell">
                  Reserved
                </th>
                <th scope="col" className="text-right">
                  Sellable
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const key = `${row.productId}:${row.variantId}`;
                const draft = drafts[key];
                const value = draft === undefined ? row.stock : draft;
                const dirty = draft !== undefined && Number(draft) !== row.stock;

                return (
                  <tr key={key} className={dirty ? 'bg-mustard-50' : undefined}>
                    <td>
                      <div className="min-w-0">
                        <Link
                          to={`/admin/products/${row.productId}/edit`}
                          className="text-ink-900 hover:text-brand-700 block truncate font-medium"
                        >
                          {row.name}
                        </Link>
                        <p className="text-ink-400 font-mono text-xs">{row.sku}</p>
                      </div>
                    </td>

                    <td className="whitespace-nowrap text-sm">{row.size}</td>

                    <td className="tnum hidden text-sm md:table-cell">{formatPrice(row.price)}</td>

                    <td className="text-right">
                      <label className="sr-only" htmlFor={`stock-${key}`}>
                        Stock for {row.name} {row.size}
                      </label>
                      <input
                        id={`stock-${key}`}
                        type="number"
                        min={0}
                        step={1}
                        value={value}
                        onChange={(event) => setDraft(key, event.target.value)}
                        onBlur={() => commitOne(row)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            event.currentTarget.blur();
                          }
                        }}
                        className="field-input tnum ml-auto min-h-9 w-20 text-right text-sm"
                      />
                    </td>

                    <td className="tnum text-ink-500 hidden text-right text-sm sm:table-cell">
                      {row.reservedStock ? formatNumber(row.reservedStock) : '—'}
                    </td>

                    <td className="tnum text-right text-sm font-semibold">
                      {formatNumber(row.availableStock)}
                    </td>

                    <td>
                      <StockBadge
                        available={row.availableStock}
                        threshold={row.lowStockThreshold}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon="box"
            title={search ? 'Nothing matched that' : 'Nothing to count yet'}
            description={
              search
                ? 'Try a shorter search, or switch to the “Everything” tab.'
                : 'Add a product with at least one size and it will appear here.'
            }
            action={search ? undefined : 'Add a product'}
            actionTo={search ? undefined : '/admin/products/new'}
          />
        </div>
      )}
    </>
  );
}
