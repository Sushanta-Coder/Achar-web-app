import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import EmptyState, { ErrorState } from '../../components/ui/EmptyState';
import { SkeletonRows } from '../../components/ui/Spinner';
import { FilterBar, PageHeader, Pagination, StatTile } from '../../components/admin/AdminPage';
import { useDebounced, useFetch } from '../../hooks/useApi';
import useSeo from '../../hooks/useSeo';
import { formatDate, formatNumber, formatPrice, initials } from '../../lib/format';

/**
 * Customers.
 *
 * `orderCount` and `totalSpent` are denormalised counters on the user document, kept for
 * sorting - a "top customers" sort across an aggregate would scan every order. The customer
 * detail page recomputes both from the orders themselves and says so if they disagree, which
 * is why this list is allowed to trust them.
 */

export default function AdminCustomers() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debouncedSearch = useDebounced(search);

  useSeo({ title: 'Customers · Admin', noIndex: true });

  const page = Number(params.get('page') ?? 1);
  const sort = params.get('sort') ?? 'newest';

  const setFilter = (patchValues, { keepPage = false } = {}) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patchValues)) {
      if (!value) next.delete(key);
      else next.set(key, String(value));
    }
    if (!keepPage) next.delete('page');
    setParams(next, { replace: true });
  };

  const query = useMemo(() => {
    const built = { page, limit: 20, sort };
    if (params.get('active')) built.active = params.get('active');
    if (params.get('hasOrders')) built.hasOrders = params.get('hasOrders');
    if (debouncedSearch.trim()) built.q = debouncedSearch.trim();
    return built;
  }, [page, sort, params, debouncedSearch]);

  const { data, loading, error, refetch } = useFetch('/admin/customers', { params: query });

  const customers = data?.customers ?? [];
  const stats = data?.stats ?? {};
  const hasFilters = Boolean(search || params.get('active') || params.get('hasOrders'));

  return (
    <>
      <PageHeader
        title="Customers"
        description="Registered accounts. Guest orders are not accounts, so they appear only under Orders."
        actions={
          <a href="/api/admin/export/customers" className="btn-outline btn-sm">
            <Icon name="download" className="size-4" />
            Export CSV
          </a>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Customers"
          value={formatNumber(stats.total ?? 0)}
          sub="registered accounts"
          icon="users"
        />
        <StatTile
          label="Have ordered"
          value={formatNumber(stats.withOrders ?? 0)}
          sub={
            stats.total
              ? `${Math.round(((stats.withOrders ?? 0) / stats.total) * 100)}% of accounts`
              : undefined
          }
          icon="truck"
          tone="leaf"
        />
        <StatTile
          label="New this month"
          value={formatNumber(stats.newThisMonth ?? 0)}
          icon="plus"
          tone="mustard"
        />
        <StatTile
          label="Average spend"
          value={formatPrice(stats.averageSpent ?? 0)}
          sub="per customer who has ordered"
          icon="wallet"
          tone="ink"
        />
      </div>

      <FilterBar
        value={search}
        onChange={setSearch}
        placeholder="Name, email or phone…"
        onReset={
          hasFilters
            ? () => {
                setSearch('');
                setFilter({ q: '', active: '', hasOrders: '' });
              }
            : undefined
        }
      >
        <select
          aria-label="Has ordered"
          value={params.get('hasOrders') ?? ''}
          onChange={(event) => setFilter({ hasOrders: event.target.value })}
          className="field-input min-h-10 w-auto text-sm"
        >
          <option value="">Everyone</option>
          <option value="true">Has ordered</option>
          <option value="false">Never ordered</option>
        </select>

        <select
          aria-label="Account status"
          value={params.get('active') ?? ''}
          onChange={(event) => setFilter({ active: event.target.value })}
          className="field-input min-h-10 w-auto text-sm"
        >
          <option value="">Any status</option>
          <option value="true">Active</option>
          <option value="false">Blocked</option>
        </select>

        <select
          aria-label="Sort"
          value={sort}
          onChange={(event) => setFilter({ sort: event.target.value })}
          className="field-input min-h-10 w-auto text-sm"
        >
          <option value="newest">Newest first</option>
          <option value="spent">Highest spend</option>
          <option value="orders">Most orders</option>
          <option value="name">Name</option>
        </select>
      </FilterBar>

      {error ? <ErrorState error={error} onRetry={refetch} /> : null}

      {!error && loading ? (
        <div className="card p-4">
          <SkeletonRows rows={8} columns={5} />
        </div>
      ) : null}

      {!error && !loading && !customers.length ? (
        <div className="card">
          <EmptyState
            icon="users"
            title={hasFilters ? 'Nobody matched that' : 'No customers yet'}
            description={
              hasFilters
                ? 'Try a shorter search or clear the filters.'
                : 'Accounts appear here as soon as people register on the shop.'
            }
          />
        </div>
      ) : null}

      {!error && !loading && customers.length ? (
        <>
          <div className="card overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col" className="hidden md:table-cell">
                    Phone
                  </th>
                  <th scope="col" className="text-right">
                    Orders
                  </th>
                  <th scope="col" className="text-right">
                    Spent
                  </th>
                  <th scope="col" className="hidden lg:table-cell">
                    Joined
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer._id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className="bg-brand-100 text-brand-800 grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold">
                          {initials(customer.name)}
                        </span>
                        <div className="min-w-0">
                          <Link
                            to={`/admin/customers/${customer._id}`}
                            className="text-ink-900 hover:text-brand-700 block truncate font-medium"
                          >
                            {customer.name}
                          </Link>
                          <p className="text-ink-400 truncate text-xs">{customer.email}</p>
                        </div>
                      </div>
                    </td>

                    <td className="tnum hidden text-sm whitespace-nowrap md:table-cell">
                      {customer.phone ?? '—'}
                    </td>

                    <td className="tnum text-right text-sm">{formatNumber(customer.orderCount ?? 0)}</td>

                    <td className="tnum text-right text-sm font-semibold whitespace-nowrap">
                      {formatPrice(customer.totalSpent ?? 0)}
                    </td>

                    <td className="text-ink-500 hidden text-xs whitespace-nowrap lg:table-cell">
                      {formatDate(customer.createdAt)}
                    </td>

                    <td>
                      {customer.isActive === false ? (
                        <span className="badge border border-red-200 bg-red-50 text-red-700">
                          Blocked
                        </span>
                      ) : customer.isEmailVerified ? (
                        <span className="badge border-leaf-200 bg-leaf-100 text-leaf-800 border">
                          Verified
                        </span>
                      ) : (
                        <span className="badge border-cream-400 bg-cream-200 text-ink-600 border">
                          Unverified
                        </span>
                      )}
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
    </>
  );
}
