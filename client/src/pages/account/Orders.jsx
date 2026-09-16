import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import { SkeletonRows } from '../../components/ui/Spinner';
import EmptyState, { ErrorState } from '../../components/ui/EmptyState';
import StatusBadge, { PaymentBadge } from '../../components/admin/StatusBadge';
import { Pagination, TabBar } from '../../components/admin/AdminPage';
import { useFetch } from '../../hooks/useApi';
import { formatDate, formatPrice } from '../../lib/format';

/**
 * The customer's order history.
 *
 * `GET /api/orders/mine` is scoped to `req.user._id` server-side and accepts no user id,
 * so there is nothing here to tamper with - the filter below only narrows what is already
 * theirs.
 *
 * Filter and page live in the URL rather than in state. Someone who opens an order and
 * comes back with the browser's back button lands on the same page of the same filter,
 * which is what "back" is supposed to mean.
 *
 * The list endpoint sends `itemPreview` and `thumbnail` instead of full line items, so
 * this page renders a recognisable row - the first jar's photo and the names - without
 * downloading every order's contents.
 */

/*
  Grouped rather than one tab per status: nine statuses would not fit, and a customer
  thinking "where is my order" does not care whether it is packed or out for delivery.
  `active` maps to the statuses the server treats as in-flight.
*/
const TABS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'In progress' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

const ACTIVE_STATUSES = [
  'pending',
  'payment_pending',
  'paid',
  'processing',
  'packed',
  'shipped',
  'out_for_delivery',
];

export default function Orders() {
  const [params, setParams] = useSearchParams();

  const tab = TABS.some((entry) => entry.value === params.get('tab')) ? params.get('tab') : 'all';
  const page = Math.max(1, Number(params.get('page')) || 1);

  /*
    The API filters on a single status, so "In progress" cannot be one request. It is
    fetched unfiltered and narrowed here. That is honest about the trade-off: the count
    on a page of twelve may be smaller than twelve. The alternative - seven parallel
    requests, or a new server-side filter - buys very little for a list this size.
  */
  const query = {
    page,
    limit: 12,
    ...(tab === 'delivered' ? { status: 'delivered' } : {}),
    ...(tab === 'cancelled' ? { status: 'cancelled' } : {}),
  };

  const { data, error, loading, refetch } = useFetch('/orders/mine', { params: query });

  const all = data?.orders ?? [];
  const orders = tab === 'active' ? all.filter((order) => ACTIVE_STATUSES.includes(order.status)) : all;

  const setTab = (id) => setParams(id === 'all' ? {} : { tab: id }, { replace: true });
  const setPage = (next) => {
    const updated = new URLSearchParams(params);
    updated.set('page', String(next));
    setParams(updated);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl">Your orders</h1>
      <p className="text-ink-500 mt-1 text-sm">
        Every order, with where it has got to and what was in it.
      </p>

      <div className="mt-5">
        <TabBar tabs={TABS} active={tab} onChange={setTab} />
      </div>

      {error ? (
        <div className="card mt-4 p-5">
          <ErrorState error={error} onRetry={refetch} />
        </div>
      ) : loading ? (
        <div className="card mt-4 p-4">
          <SkeletonRows rows={5} columns={4} />
        </div>
      ) : orders.length ? (
        <>
          <ul className="mt-4 space-y-3">
            {orders.map((order) => (
              <OrderRow key={order._id} order={order} />
            ))}
          </ul>

          {/*
            Paginated on the unfiltered count, so the "In progress" tab can show fewer
            rows than the page size claims. Hidden entirely when there is one page.
          */}
          {tab !== 'active' ? <Pagination meta={data.meta} onPage={setPage} className="mt-5" /> : null}
        </>
      ) : (
        <div className="card mt-4">
          <EmptyState
            icon="package"
            title={tab === 'all' ? 'No orders yet' : 'Nothing in this list'}
            description={
              tab === 'all'
                ? 'When you order, this is where you follow it from our kitchen to your door.'
                : 'Try another tab - your other orders are still there.'
            }
            action={tab === 'all' ? 'Browse the pickles' : undefined}
            actionTo="/shop"
          />
        </div>
      )}
    </div>
  );
}

function OrderRow({ order }) {
  const names = (order.itemPreview ?? []).map((item) => item.name);
  const extra = order.itemCount - (order.itemPreview ?? []).reduce((sum, i) => sum + i.quantity, 0);

  return (
    <li className="card hover:shadow-[--shadow-card-hover] transition">
      <Link to={`/account/orders/${order.orderNumber}`} className="block p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="tnum font-medium">{order.orderNumber}</p>
            <p className="text-ink-400 text-xs">Placed {formatDate(order.createdAt)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={order.status} />
            <PaymentBadge status={order.paymentStatus} method={order.paymentMethod} />
          </div>
        </div>

        <div className="border-cream-200 mt-3 flex items-center gap-3 border-t pt-3">
          <span className="bg-cream-200 size-12 shrink-0 overflow-hidden rounded-lg">
            {order.thumbnail?.url ? (
              <img
                src={order.thumbnail.url}
                alt={order.thumbnail.alt ?? ''}
                className="size-full object-cover"
                loading="lazy"
              />
            ) : null}
          </span>

          <span className="text-ink-600 min-w-0 flex-1 text-sm">
            <span className="line-clamp-2">
              {names.join(', ')}
              {extra > 0 ? ` and ${extra} more` : ''}
            </span>
            <span className="text-ink-400 block text-xs">
              {order.itemCount} {order.itemCount === 1 ? 'jar' : 'jars'}
            </span>
          </span>

          <span className="text-right">
            <span className="tnum block font-medium">{formatPrice(order.pricing.total)}</span>
            {order.status === 'delivered' && order.deliveredAt ? (
              <span className="text-leaf-700 block text-xs">
                Delivered {formatDate(order.deliveredAt)}
              </span>
            ) : order.delivery?.estimatedDeliveryDate ? (
              <span className="text-ink-400 block text-xs">
                By {formatDate(order.delivery.estimatedDeliveryDate)}
              </span>
            ) : null}
          </span>

          <Icon name="chevronRight" className="text-ink-400 size-4 shrink-0" />
        </div>
      </Link>
    </li>
  );
}
