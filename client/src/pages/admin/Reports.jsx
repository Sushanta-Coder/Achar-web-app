import { useState } from 'react';
import Icon from '../../components/ui/Icon';
import { ErrorState } from '../../components/ui/EmptyState';
import { PageLoader } from '../../components/ui/Spinner';
import { PageHeader, Panel, StatTile, TabBar } from '../../components/admin/AdminPage';
import { BarList, SalesChart } from '../../components/admin/Charts';
import { useFetch } from '../../hooks/useApi';
import useSeo from '../../hooks/useSeo';
import { formatDate, formatNumber, formatPercent, formatPrice, formatPriceCompact } from '../../lib/format';

/**
 * Reports.
 *
 * One request for the whole page (`GET /admin/reports?range=…`) rather than a request per
 * panel. Eight small aggregations on the same date window are cheaper as one round trip, and
 * more importantly every panel then describes the *same* period — a page where the chart and
 * the best-seller table disagree because one refetched and the other did not is worse than no
 * page at all.
 *
 * Revenue counts paid orders only, which is why these totals are lower than the order count
 * suggests. Cancelled and unpaid baskets are traffic, not money.
 *
 * All buckets are Nepal Time. The server groups with an explicit timezone for this reason: a
 * UTC day boundary puts an evening sale in Kathmandu on the wrong day of the chart.
 */

const RANGE_TABS = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'mtd', label: 'This month' },
  { value: '12m', label: '12 months' },
];

export default function AdminReports() {
  const [range, setRange] = useState('30d');
  const [metric, setMetric] = useState('revenue');

  useSeo({ title: 'Reports · Admin', noIndex: true });

  const { data, loading, error, refetch } = useFetch('/admin/reports', {
    params: { range },
    deps: [range],
  });

  if (loading && !data) return <PageLoader label="Crunching the numbers" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const summary = data?.summary ?? {};
  const sales = data?.sales ?? { points: [], unit: 'day' };
  const rangeLabel = summary.range?.label ?? data?.range?.label ?? '';

  return (
    <>
      <PageHeader
        title="Reports"
        description={`${rangeLabel}. Revenue is settled money only — paid orders, minus nothing that was refunded.`}
        actions={
          <a href="/api/admin/export/orders" className="btn-outline btn-sm">
            <Icon name="download" className="size-4" />
            Export orders
          </a>
        }
      />

      <TabBar tabs={RANGE_TABS} active={range} onChange={setRange} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Revenue"
          value={formatPrice(summary.revenue?.value ?? 0)}
          sub={`was ${formatPriceCompact(summary.revenue?.previous ?? 0)}`}
          delta={summary.revenue?.changePercent}
          icon="wallet"
          tone="leaf"
        />
        <StatTile
          label="Paid orders"
          value={formatNumber(summary.orders?.value ?? 0)}
          sub={`was ${formatNumber(summary.orders?.previous ?? 0)}`}
          delta={summary.orders?.changePercent}
          icon="package"
          tone="brand"
        />
        <StatTile
          label="Average basket"
          value={formatPrice(summary.averageOrderValue?.value ?? 0)}
          sub={`was ${formatPriceCompact(summary.averageOrderValue?.previous ?? 0)}`}
          delta={summary.averageOrderValue?.changePercent}
          icon="chart"
          tone="mustard"
        />
        <StatTile
          label="Jars sold"
          value={formatNumber(summary.itemsSold?.value ?? 0)}
          sub={`was ${formatNumber(summary.itemsSold?.previous ?? 0)}`}
          delta={summary.itemsSold?.changePercent}
          icon="box"
          tone="ink"
        />
      </div>

      <Panel
        title={metric === 'revenue' ? 'Revenue over time' : 'Orders over time'}
        actions={
          <div className="border-cream-300 flex overflow-hidden rounded-lg border bg-white">
            {[
              { value: 'revenue', label: 'Revenue' },
              { value: 'orders', label: 'Orders' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setMetric(option.value)}
                aria-current={metric === option.value ? 'true' : undefined}
                className={`cursor-pointer px-3 py-1.5 text-xs font-medium transition ${
                  metric === option.value
                    ? 'bg-ink-800 text-white'
                    : 'text-ink-600 hover:bg-cream-100'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
        className="mb-4"
      >
        <SalesChart points={sales.points} valueKey={metric} height={240} />
      </Panel>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Best sellers" bodyClassName="p-4">
          <BarList
            items={data?.bestSellers ?? []}
            valueKey="unitsSold"
            labelKey="name"
            format={(value) => `${formatNumber(value)} jars`}
          />
        </Panel>

        <Panel title="Revenue by category" bodyClassName="p-4">
          <BarList items={data?.categories ?? []} valueKey="revenue" labelKey="name" format={formatPrice} />
        </Panel>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Panel title="How people pay" bodyClassName="p-0">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Method</th>
                <th scope="col" className="text-right">
                  Orders
                </th>
                <th scope="col" className="text-right">
                  Revenue
                </th>
                <th scope="col" className="text-right">
                  Share
                </th>
              </tr>
            </thead>
            <tbody>
              {(data?.payments ?? []).map((row) => (
                <tr key={row.method}>
                  <td className="text-sm font-medium">{row.label}</td>
                  <td className="tnum text-right text-sm">{formatNumber(row.orders)}</td>
                  <td className="tnum text-right text-sm">{formatPrice(row.revenue)}</td>
                  <td className="tnum text-ink-500 text-right text-sm">
                    {formatPercent(row.share)}
                  </td>
                </tr>
              ))}
              {!data?.payments?.length ? (
                <tr>
                  <td colSpan={4} className="text-ink-400 py-6 text-center text-sm">
                    No paid orders in this period.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Panel>

        {/*
          Gateway reliability is here rather than on the Payments screen because it is a
          trend, not an incident. A success rate that slides from 95% to 70% over a month is
          a conversation with the provider; one failed payment is not.
        */}
        <Panel title="Gateway reliability" bodyClassName="p-0">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Gateway</th>
                <th scope="col" className="text-right">
                  Attempts
                </th>
                <th scope="col" className="text-right">
                  Settled
                </th>
                <th scope="col" className="text-right">
                  Success
                </th>
              </tr>
            </thead>
            <tbody>
              {(data?.reliability ?? []).map((row) => (
                <tr key={row.gateway}>
                  <td className="text-sm font-medium">{row.label}</td>
                  <td className="tnum text-right text-sm">{formatNumber(row.attempts)}</td>
                  <td className="tnum text-right text-sm">{formatNumber(row.paid)}</td>
                  <td className="text-right">
                    <span
                      className={`badge border ${
                        row.successRate >= 90
                          ? 'border-leaf-200 bg-leaf-100 text-leaf-800'
                          : row.successRate >= 70
                            ? 'border-mustard-200 bg-mustard-50 text-mustard-800'
                            : 'border-red-200 bg-red-50 text-red-700'
                      }`}
                    >
                      {formatPercent(row.successRate)}
                    </span>
                  </td>
                </tr>
              ))}
              {!data?.reliability?.length ? (
                <tr>
                  <td colSpan={4} className="text-ink-400 py-6 text-center text-sm">
                    No gateway attempts in this period.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/*
          Districts, not cities. Delivery zones are priced by district, so this is the table
          that tells you whether a zone's charge is covering what it costs to serve.
        */}
        <Panel title="Where the orders go" bodyClassName="p-0">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">District</th>
                <th scope="col" className="hidden sm:table-cell">
                  Province
                </th>
                <th scope="col" className="text-right">
                  Orders
                </th>
                <th scope="col" className="text-right">
                  Revenue
                </th>
              </tr>
            </thead>
            <tbody>
              {(data?.districts ?? []).map((row) => (
                <tr key={`${row.province}-${row.district}`}>
                  <td className="text-sm font-medium">{row.district}</td>
                  <td className="text-ink-500 hidden text-xs sm:table-cell">{row.province}</td>
                  <td className="tnum text-right text-sm">{formatNumber(row.orders)}</td>
                  <td className="tnum text-right text-sm">{formatPrice(row.revenue)}</td>
                </tr>
              ))}
              {!data?.districts?.length ? (
                <tr>
                  <td colSpan={4} className="text-ink-400 py-6 text-center text-sm">
                    No deliveries in this period.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Panel>

        {/*
          Top customers is lifetime, not windowed — a repeat buyer's value is the whole
          relationship, and a 30-day slice of it is not the number you would act on.
        */}
        <Panel
          title="Best customers"
          actions={<span className="text-ink-400 text-xs">All time</span>}
          bodyClassName="p-0"
        >
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Customer</th>
                <th scope="col" className="text-right">
                  Orders
                </th>
                <th scope="col" className="text-right">
                  Spent
                </th>
                <th scope="col" className="hidden md:table-cell">
                  Last order
                </th>
              </tr>
            </thead>
            <tbody>
              {(data?.customers ?? []).map((row) => (
                <tr key={row._id ?? row.email}>
                  <td>
                    <p className="text-sm font-medium">{row.name}</p>
                    <p className="text-ink-400 truncate text-xs">{row.email ?? row.phone}</p>
                  </td>
                  <td className="tnum text-right text-sm">{formatNumber(row.orders)}</td>
                  <td className="tnum text-right text-sm font-semibold">{formatPrice(row.spent)}</td>
                  <td className="text-ink-500 hidden text-xs whitespace-nowrap md:table-cell">
                    {row.lastOrderAt ? formatDate(row.lastOrderAt) : '—'}
                  </td>
                </tr>
              ))}
              {!data?.customers?.length ? (
                <tr>
                  <td colSpan={4} className="text-ink-400 py-6 text-center text-sm">
                    No customers have ordered yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}
