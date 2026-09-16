import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import EmptyState, { ErrorState } from '../../components/ui/EmptyState';
import { SkeletonRows } from '../../components/ui/Spinner';
import StatusBadge, {
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PaymentBadge,
} from '../../components/admin/StatusBadge';
import { FilterBar, PageHeader, Pagination, TabBar } from '../../components/admin/AdminPage';
import { useFetch, useDebounced } from '../../hooks/useApi';
import useSeo from '../../hooks/useSeo';
import { formatDateTime, formatPrice, toDateInputValue } from '../../lib/format';

/**
 * Order management.
 *
 * The tab counts come from `GET /orders/admin/status-counts` in one request rather than
 * one per tab, and the tab strip is built from that payload's `counts` map - so a status
 * added server-side appears here with a real number rather than silently reading zero.
 *
 * Filter state lives in the URL. That is not decoration: "show me today's unpaid COD
 * orders" is a thing staff say to each other, and a URL is how you say it back.
 */

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  ...Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'total-high', label: 'Highest value' },
  { value: 'total-low', label: 'Lowest value' },
];

export default function AdminOrders() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debouncedSearch = useDebounced(search);

  useSeo({ title: 'Orders · Admin', noIndex: true });

  const status = params.get('status') ?? 'all';
  const page = Number(params.get('page') ?? 1);

  /** Writes a set of filters to the URL, resetting to page 1 unless paging. */
  const setFilter = (patch, { keepPage = false } = {}) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === '' || value == null || value === 'all') next.delete(key);
      else next.set(key, String(value));
    }
    if (!keepPage) next.delete('page');
    setParams(next, { replace: true });
  };

  const query = useMemo(() => {
    const built = { page, limit: 20, sort: params.get('sort') ?? 'newest' };
    if (status !== 'all') built.status = status;
    if (params.get('paymentStatus')) built.paymentStatus = params.get('paymentStatus');
    if (params.get('paymentMethod')) built.paymentMethod = params.get('paymentMethod');
    if (params.get('from')) built.from = params.get('from');
    if (params.get('to')) built.to = params.get('to');
    if (debouncedSearch.trim()) built.q = debouncedSearch.trim();
    return built;
  }, [page, status, params, debouncedSearch]);

  const { data, loading, error, refetch } = useFetch('/orders/admin/list', { params: query });
  const counts = useFetch('/orders/admin/status-counts');

  const orders = data?.orders ?? [];
  const hasFilters = ['paymentStatus', 'paymentMethod', 'from', 'to'].some((key) => params.get(key));

  return (
    <>
      <PageHeader
        title="Orders"
        description="Every order, newest first. Open one to change its status or add tracking."
        actions={
          <>
            <button type="button" onClick={refetch} className="btn-outline btn-sm">
              <Icon name="refresh" className="size-4" />
              Refresh
            </button>
            <a href="/api/admin/export/orders" className="btn-outline btn-sm">
              <Icon name="download" className="size-4" />
              Export CSV
            </a>
          </>
        }
      />

      <TabBar
        tabs={STATUS_TABS}
        active={status}
        counts={counts.data?.counts ?? {}}
        onChange={(value) => setFilter({ status: value })}
      />

      <FilterBar
        value={search}
        onChange={setSearch}
        placeholder="Order number, name, phone or email…"
        onReset={
          hasFilters || search
            ? () => {
                setSearch('');
                setFilter({ paymentStatus: '', paymentMethod: '', from: '', to: '', q: '' });
              }
            : undefined
        }
      >
        <select
          aria-label="Payment status"
          value={params.get('paymentStatus') ?? ''}
          onChange={(event) => setFilter({ paymentStatus: event.target.value })}
          className="field-input min-h-10 w-auto text-sm"
        >
          <option value="">Any payment</option>
          <option value="pending">Unpaid</option>
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
        </select>

        <select
          aria-label="Payment method"
          value={params.get('paymentMethod') ?? ''}
          onChange={(event) => setFilter({ paymentMethod: event.target.value })}
          className="field-input min-h-10 w-auto text-sm"
        >
          <option value="">Any method</option>
          {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <input
          type="date"
          aria-label="From date"
          max={toDateInputValue()}
          value={params.get('from') ?? ''}
          onChange={(event) => setFilter({ from: event.target.value })}
          className="field-input min-h-10 w-auto text-sm"
        />
        <input
          type="date"
          aria-label="To date"
          max={toDateInputValue()}
          value={params.get('to') ?? ''}
          onChange={(event) => setFilter({ to: event.target.value })}
          className="field-input min-h-10 w-auto text-sm"
        />

        <select
          aria-label="Sort"
          value={params.get('sort') ?? 'newest'}
          onChange={(event) => setFilter({ sort: event.target.value })}
          className="field-input min-h-10 w-auto text-sm"
        >
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FilterBar>

      {error ? <ErrorState error={error} onRetry={refetch} /> : null}

      {!error && loading ? (
        <div className="card p-4">
          <SkeletonRows rows={8} columns={6} />
        </div>
      ) : null}

      {!error && !loading && !orders.length ? (
        <div className="card">
          <EmptyState
            icon="truck"
            title="No orders match this view"
            description={
              status === 'all' && !search
                ? 'Orders will appear here as soon as customers start checking out.'
                : 'Try a different status or clear the filters.'
            }
            action={status !== 'all' || search ? 'Show all orders' : undefined}
            onAction={() => {
              setSearch('');
              setFilter({ status: 'all', q: '', paymentStatus: '', paymentMethod: '', from: '', to: '' });
            }}
          />
        </div>
      ) : null}

      {!error && !loading && orders.length ? (
        <>
          {/* Desktop: a table. Mobile: cards - a six-column table on a 360px screen is
              unreadable, and staff do check orders from a phone. */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Placed</th>
                  <th scope="col">Payment</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-right">
                    Total
                  </th>
                  <th scope="col" className="sr-only">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order._id}>
                    <td>
                      <Link
                        to={`/admin/orders/${order._id}`}
                        className="text-brand-700 font-semibold hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                      <p className="text-ink-400 text-xs">
                        {order.items?.length ?? 0} item{(order.items?.length ?? 0) === 1 ? '' : 's'}
                        {order.isGuest ? ' · guest' : ''}
                      </p>
                    </td>
                    <td>
                      <p className="text-ink-800 font-medium">{order.customer?.name}</p>
                      <p className="text-ink-400 text-xs">{order.customer?.phone}</p>
                    </td>
                    <td className="text-ink-500 text-xs">{formatDateTime(order.createdAt)}</td>
                    <td>
                      <PaymentBadge status={order.paymentStatus} method={order.paymentMethod} />
                    </td>
                    <td>
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="tnum text-right font-semibold">
                      {formatPrice(order.pricing?.total)}
                    </td>
                    <td className="text-right">
                      <Link to={`/admin/orders/${order._id}`} className="btn-ghost btn-sm">
                        Open
                        <Icon name="chevronRight" className="size-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-2 md:hidden">
            {orders.map((order) => (
              <li key={order._id}>
                <Link to={`/admin/orders/${order._id}`} className="card block p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-brand-700 font-semibold">{order.orderNumber}</p>
                      <p className="text-ink-700 truncate text-sm">{order.customer?.name}</p>
                      <p className="text-ink-400 text-xs">{formatDateTime(order.createdAt)}</p>
                    </div>
                    <p className="tnum shrink-0 font-bold">{formatPrice(order.pricing?.total)}</p>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <StatusBadge status={order.status} />
                    <PaymentBadge status={order.paymentStatus} method={order.paymentMethod} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <Pagination
            meta={data.meta}
            onPage={(next) => setFilter({ page: next }, { keepPage: true })}
            className="mt-4"
          />
        </>
      ) : null}
    </>
  );
}
