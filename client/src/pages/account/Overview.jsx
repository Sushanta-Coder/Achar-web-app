import { Link } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import { SkeletonRows } from '../../components/ui/Spinner';
import EmptyState, { ErrorState } from '../../components/ui/EmptyState';
import StatusBadge, { PaymentBadge } from '../../components/admin/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../hooks/useApi';
import { formatDate, formatPrice } from '../../lib/format';

/**
 * The account landing page.
 *
 * One request. `GET /api/users/me/summary` assembles the counts, the last five orders and
 * the wishlist size server-side in a single aggregation pass, which is why this page does
 * not stitch together four fetches - four spinners settling at different moments is a
 * worse experience than one, and this hook has no shared cache to make them cheap.
 */
export default function Overview() {
  const { user } = useAuth();
  const { data, error, loading, refetch } = useFetch('/users/me/summary');

  const stats = data?.stats;
  const recent = data?.recentOrders ?? [];
  const firstName = user.name.split(' ')[0];

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl">Namaste, {firstName}</h1>
      <p className="text-ink-500 mt-1 text-sm">
        Everything you have ordered, saved and said about our achar.
      </p>

      {error ? (
        <div className="card mt-5 p-5">
          <ErrorState error={error} onRetry={refetch} />
        </div>
      ) : (
        <>
          {/* --- Counts --------------------------------------------------- */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile
              label="Orders"
              value={loading ? null : stats.totalOrders}
              icon="package"
              to="/account/orders"
            />
            <Tile
              label="In progress"
              value={loading ? null : stats.openOrders}
              icon="truck"
              to="/account/orders"
              highlight={Boolean(stats?.openOrders)}
            />
            <Tile
              label="Wishlist"
              value={loading ? null : stats.wishlistItems}
              icon="heart"
              to="/wishlist"
            />
            <Tile
              label="Reviews"
              value={loading ? null : stats.reviews}
              icon="star"
              to="/account/reviews"
            />
          </div>

          {/*
            Lifetime spend counts paid, non-cancelled orders only - the same rule the
            server's aggregation uses. Showing a total that included an abandoned
            payment would be flattering and wrong.
          */}
          {!loading && stats.totalSpent > 0 ? (
            <p className="text-ink-500 mt-3 text-sm">
              You have spent{' '}
              <span className="tnum text-ink-800 font-medium">
                {formatPrice(stats.totalSpent)}
              </span>{' '}
              with us across {stats.totalOrders} {stats.totalOrders === 1 ? 'order' : 'orders'}.
              Thank you.
            </p>
          ) : null}

          {/* --- Recent orders -------------------------------------------- */}
          <div className="card mt-6">
            <div className="border-cream-300 flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-base">Recent orders</h2>
              {recent.length ? (
                <Link to="/account/orders" className="text-brand-700 text-sm hover:underline">
                  See all
                </Link>
              ) : null}
            </div>

            {loading ? (
              <div className="p-4">
                <SkeletonRows rows={3} columns={4} />
              </div>
            ) : recent.length ? (
              <ul className="divide-cream-200 divide-y">
                {recent.map((order) => (
                  <li key={order._id}>
                    <Link
                      to={`/account/orders/${order.orderNumber}`}
                      className="hover:bg-cream-50 flex flex-wrap items-center gap-3 px-4 py-3 transition"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="tnum block text-sm font-medium">{order.orderNumber}</span>
                        <span className="text-ink-400 block text-xs">
                          {formatDate(order.createdAt)} · {order.itemCount}{' '}
                          {order.itemCount === 1 ? 'jar' : 'jars'}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={order.status} />
                        <PaymentBadge status={order.paymentStatus} method={order.paymentMethod} />
                      </span>
                      <span className="tnum w-24 text-right text-sm font-medium">
                        {formatPrice(order.pricing.total)}
                      </span>
                      <Icon name="chevronRight" className="text-ink-400 size-4" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon="package"
                title="No orders yet"
                description="Once you order, this is where you follow it from our kitchen to your door."
                action="Browse the pickles"
                actionTo="/shop"
              />
            )}
          </div>

          {/* --- Shortcuts ------------------------------------------------ */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Shortcut
              to="/account/addresses"
              icon="pin"
              title="Delivery addresses"
              description="Save the places you order to and skip typing them at checkout."
            />
            <Shortcut
              to="/account/reviews"
              icon="star"
              title="Rate what you have tried"
              description="Tell other customers which achar is worth it."
            />
          </div>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, icon, to, highlight }) {
  return (
    <Link
      to={to}
      className={`card hover:shadow-[--shadow-card-hover] block p-3.5 transition ${
        highlight ? 'border-brand-200' : ''
      }`}
    >
      <span className="flex items-center justify-between">
        <span className="text-ink-500 text-xs font-semibold tracking-wide uppercase">{label}</span>
        <Icon
          name={icon}
          className={highlight ? 'text-brand-600 size-4' : 'text-ink-400 size-4'}
        />
      </span>
      <span
        className={`tnum mt-1 block text-2xl font-bold ${
          highlight ? 'text-brand-700' : 'text-ink-800'
        }`}
      >
        {value === null ? <span className="bg-cream-200 inline-block h-7 w-8 rounded" /> : value}
      </span>
    </Link>
  );
}

function Shortcut({ to, icon, title, description }) {
  return (
    <Link to={to} className="card hover:shadow-[--shadow-card-hover] flex gap-3 p-4 transition">
      <span className="bg-cream-200 text-ink-600 grid size-9 shrink-0 place-items-center rounded-lg">
        <Icon name={icon} className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="text-ink-500 block text-xs">{description}</span>
      </span>
      <Icon name="chevronRight" className="text-ink-400 mt-1 size-4 shrink-0" />
    </Link>
  );
}
