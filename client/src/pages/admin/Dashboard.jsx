import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import { ErrorState } from '../../components/ui/EmptyState';
import { PageLoader } from '../../components/ui/Spinner';
import { PageHeader, Panel, StatTile } from '../../components/admin/AdminPage';
import { BarList, SalesChart } from '../../components/admin/Charts';
import { StockBadge } from '../../components/admin/StatusBadge';
import { useFetch } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import useSeo from '../../hooks/useSeo';
import { formatNumber, formatPrice } from '../../lib/format';

/**
 * Dashboard.
 *
 * Structured around what needs doing rather than what looks impressive: the action
 * queues sit above the charts, because an order stuck awaiting payment costs money and a
 * revenue graph does not tell you about it.
 *
 * One request (`GET /admin/dashboard`) fills the whole page - summary, series, best
 * sellers, action counts and gateway health - so opening the dashboard is one round trip
 * rather than six.
 */

const RANGES = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '12m', label: '12 months' },
];

export default function AdminDashboard() {
  const [range, setRange] = useState('30d');
  const { user } = useAuth();

  useSeo({ title: 'Dashboard · Admin', noIndex: true });

  const { data, loading, error, refetch } = useFetch('/admin/dashboard', { params: { range } });

  if (loading && !data) return <PageLoader label="Loading dashboard" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return null;

  const { summary, sales, bestSellers, actionRequired, health } = data;
  const firstName = user?.name?.split(' ')[0];

  return (
    <>
      <PageHeader
        title={firstName ? `Namaste, ${firstName}` : 'Dashboard'}
        description={summary.range?.label ? `Showing ${summary.range.label.toLowerCase()}` : undefined}
        actions={
          <div className="border-cream-300 flex overflow-hidden rounded-lg border bg-white">
            {RANGES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRange(option.value)}
                aria-current={range === option.value ? 'true' : undefined}
                className={`cursor-pointer px-3 py-2 text-xs font-medium transition ${
                  range === option.value
                    ? 'bg-ink-800 text-white'
                    : 'text-ink-600 hover:bg-cream-100'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />

      {/* --- Needs attention. First, because it is the only part that is urgent. --- */}
      {health.noOnlineGateway ? (
        <div
          role="status"
          className="border-mustard-200 bg-mustard-50 mb-4 flex items-start gap-2.5 rounded-xl border p-3.5"
        >
          <Icon name="alert" className="text-mustard-700 mt-0.5 size-5 shrink-0" />
          <div className="min-w-0">
            <p className="text-mustard-900 text-sm font-semibold">
              No online payment gateway is configured
            </p>
            <p className="text-mustard-800 mt-0.5 text-sm">
              Customers can still pay cash on delivery. To take Khalti or eSewa, set their keys in
              the server environment.
            </p>
          </div>
        </div>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ActionTile
          to="/admin/orders?status=payment_pending"
          label="Awaiting payment"
          count={actionRequired.awaitingPayment}
          icon="wallet"
          hint="Started an online payment but never finished"
        />
        <ActionTile
          to="/admin/orders?status=paid"
          label="To dispatch"
          count={actionRequired.awaitingDispatch}
          icon="package"
          hint="Paid and waiting to be packed or handed over"
        />
        <ActionTile
          to="/admin/inventory"
          label="Low or no stock"
          count={actionRequired.lowStock}
          icon="box"
          hint="Sizes at or below their warning level"
        />
        <ActionTile
          to="/admin/reviews?status=pending"
          label="Reviews to check"
          count={actionRequired.pendingReviews}
          icon="star"
          hint="Not visible on the shop until approved"
        />
      </div>

      {/* --- Period performance --- */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Revenue"
          value={formatPrice(summary.revenue.value)}
          sub={`was ${formatPrice(summary.revenue.previous)}`}
          delta={summary.revenue.changePercent}
          icon="chart"
        />
        <StatTile
          label="Orders"
          value={formatNumber(summary.orders.value)}
          sub={`was ${formatNumber(summary.orders.previous)}`}
          delta={summary.orders.changePercent}
          icon="truck"
          tone="leaf"
        />
        <StatTile
          label="Average order"
          value={formatPrice(summary.averageOrderValue.value)}
          delta={summary.averageOrderValue.changePercent}
          icon="wallet"
          tone="mustard"
        />
        <StatTile
          label="Jars sold"
          value={formatNumber(summary.itemsSold.value)}
          delta={summary.itemsSold.changePercent}
          icon="box"
          tone="ink"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Revenue" className="lg:col-span-2">
          <SalesChart points={sales.points} />
        </Panel>

        <Panel title="Best sellers" actions={<Link to="/admin/reports" className="btn-ghost btn-sm">Reports</Link>}>
          <BarList items={bestSellers} valueKey="revenue" labelKey="name" />
        </Panel>

        <Panel title="Low stock" className="lg:col-span-2" bodyClassName="p-0">
          {summary.lowStock?.length ? (
            <ul className="divide-cream-200 divide-y">
              {summary.lowStock.map((row) => (
                <li key={row.sku} className="flex items-center gap-3 px-4 py-2.5">
                  {row.thumbnail ? (
                    <img
                      src={row.thumbnail}
                      alt=""
                      loading="lazy"
                      className="bg-cream-200 size-9 shrink-0 rounded-lg object-cover"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="text-ink-800 truncate text-sm font-medium">{row.name}</p>
                    <p className="text-ink-400 text-xs">
                      {row.size} · {row.sku}
                    </p>
                  </div>
                  <StockBadge
                    available={row.availableStock}
                    threshold={row.lowStockThreshold}
                    className="shrink-0"
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-500 px-4 py-6 text-center text-sm">
              Everything is comfortably in stock.
            </p>
          )}
          <div className="border-cream-300 bg-cream-50 border-t px-4 py-2.5">
            <Link to="/admin/inventory" className="text-brand-700 text-sm font-medium hover:underline">
              Manage inventory →
            </Link>
          </div>
        </Panel>

        <Panel title="All time">
          <dl className="space-y-2">
            {[
              ['Total revenue', formatPrice(summary.lifetime.revenue)],
              ['Orders', formatNumber(summary.lifetime.orders)],
              ['Open orders', formatNumber(summary.lifetime.pendingOrders)],
              ['Customers', formatNumber(summary.lifetime.customers)],
              ['Products', `${summary.lifetime.activeProducts} live of ${summary.lifetime.products}`],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <dt className="text-ink-500 text-sm">{label}</dt>
                <dd className="tnum text-ink-900 text-sm font-semibold">{value}</dd>
              </div>
            ))}
          </dl>

          {health.gateways?.length ? (
            <div className="border-cream-200 mt-3 border-t pt-3">
              <p className="text-ink-500 text-xs font-semibold tracking-wide uppercase">
                Online payments
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {health.gateways.map((gateway) => (
                  <span
                    key={gateway}
                    className="badge border-leaf-200 bg-leaf-100 text-leaf-800 border capitalize"
                  >
                    <Icon name="check" className="size-3" />
                    {gateway}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </Panel>
      </div>
    </>
  );
}

/**
 * An action tile is a count that is a link. Zero is styled down rather than hidden -
 * "0 to dispatch" is useful information, and a tile that disappears makes the grid jump.
 */
function ActionTile({ to, label, count = 0, icon, hint }) {
  const urgent = count > 0;

  return (
    <Link
      to={to}
      className={`card hover:shadow-[--shadow-card-hover] block p-4 transition ${
        urgent ? 'border-brand-200' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ink-500 text-xs font-semibold tracking-wide uppercase">{label}</p>
          <p className={`tnum mt-1 text-2xl font-bold ${urgent ? 'text-brand-700' : 'text-ink-400'}`}>
            {formatNumber(count)}
          </p>
        </div>
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-lg ${
            urgent ? 'bg-brand-50 text-brand-700' : 'bg-cream-200 text-ink-400'
          }`}
        >
          <Icon name={icon} className="size-4" />
        </span>
      </div>
      <p className="text-ink-400 mt-1 text-xs">{hint}</p>
    </Link>
  );
}
