import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import { ErrorState } from '../../components/ui/EmptyState';
import Spinner, { PageLoader } from '../../components/ui/Spinner';
import StatusBadge, { PaymentBadge } from '../../components/admin/StatusBadge';
import { DetailRow, Modal, PageHeader, Panel, StatTile } from '../../components/admin/AdminPage';
import { useFetch, useMutation } from '../../hooks/useApi';
import { patch } from '../../lib/apiClient';
import { useToast } from '../../context/ToastContext';
import useSeo from '../../hooks/useSeo';
import {
  addressLine,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPrice,
  initials,
} from '../../lib/format';

/**
 * Customer detail.
 *
 * The totals panel shows the recomputed figures from the orders, not the counters stored on
 * the user. The API returns both plus `countersMatch`, and a mismatch is surfaced rather than
 * hidden: a denormalised counter that has drifted is a real bug worth seeing, and the fix
 * (`POST /admin/customers/recount`) is one click away on the Customers list.
 *
 * Blocking an account prevents sign-in. It does not touch existing orders - those still have
 * to be delivered or cancelled explicitly, because a blocked account is a login decision and
 * not a fulfilment one.
 */

export default function AdminCustomerDetail() {
  const { id } = useParams();
  const [confirmBlock, setConfirmBlock] = useState(false);
  const toast = useToast();

  useSeo({ title: 'Customer · Admin', noIndex: true });

  const { data, loading, error, refetch } = useFetch(`/admin/customers/${id}`, { deps: [id] });

  const setActive = useMutation(
    (isActive) => patch(`/admin/customers/${id}/active`, { isActive }),
    {
      onSuccess: (result) => {
        toast.success(result.isActive ? 'Account unblocked' : 'Account blocked from signing in');
        setConfirmBlock(false);
        refetch();
      },
      onError: (normalised) => toast.error(normalised.message),
    }
  );

  if (loading && !data) return <PageLoader label="Loading customer" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data) return null;

  const { customer, orders, totals, countersMatch } = data;
  const blocked = customer.isActive === false;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Customers', to: '/admin/customers' }, { label: customer.name }]}
        title={customer.name}
        description={`Joined ${formatDate(customer.createdAt)}`}
        actions={
          <button
            type="button"
            onClick={() => (blocked ? setActive.run(true) : setConfirmBlock(true))}
            disabled={setActive.pending}
            className={blocked ? 'btn-outline btn-sm' : 'btn-outline btn-sm text-red-600'}
          >
            {setActive.pending ? <Spinner className="size-4" /> : <Icon name="user" className="size-4" />}
            {blocked ? 'Unblock account' : 'Block account'}
          </button>
        }
      />

      {blocked ? (
        <div
          role="status"
          className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5"
        >
          <Icon name="alert" className="mt-0.5 size-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-800">
            This account is blocked and cannot sign in. Existing orders are unaffected — cancel
            them individually if that is the intention.
          </p>
        </div>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Orders"
          value={formatNumber(totals.orders ?? 0)}
          sub={`${formatNumber(totals.paid ?? 0)} paid`}
          icon="truck"
        />
        <StatTile
          label="Lifetime spend"
          value={formatPrice(totals.spent ?? 0)}
          sub="paid orders only"
          icon="wallet"
          tone="leaf"
        />
        <StatTile
          label="Average order"
          value={formatPrice(totals.paid ? Math.round(totals.spent / totals.paid) : 0)}
          icon="chart"
          tone="mustard"
        />
        <StatTile
          label="Addresses"
          value={formatNumber(customer.addresses?.length ?? 0)}
          sub="saved for checkout"
          icon="pin"
          tone="ink"
        />
      </div>

      {!countersMatch ? (
        <div
          role="status"
          className="border-mustard-200 bg-mustard-50 mb-4 flex items-start gap-2.5 rounded-xl border p-3.5"
        >
          <Icon name="info" className="text-mustard-700 mt-0.5 size-5 shrink-0" />
          <div className="min-w-0">
            <p className="text-mustard-900 text-sm font-semibold">
              The stored counters have drifted
            </p>
            <p className="text-mustard-800 mt-0.5 text-sm">
              This account records {formatNumber(customer.orderCount ?? 0)} order(s) and{' '}
              {formatPrice(customer.totalSpent ?? 0)}, but the orders themselves add up to{' '}
              {formatNumber(totals.orders ?? 0)} and {formatPrice(totals.spent ?? 0)}. The figures
              above are the recomputed ones. Use <strong>Recount</strong> on the Customers list to
              repair the stored values.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Contact">
          <div className="mb-3 flex items-center gap-3">
            <span className="bg-brand-100 text-brand-800 grid size-11 shrink-0 place-items-center rounded-full text-sm font-bold">
              {initials(customer.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">{customer.name}</p>
              <p className="text-ink-400 text-xs capitalize">{customer.role}</p>
            </div>
          </div>

          <dl>
            <DetailRow label="Email">
              <a href={`mailto:${customer.email}`} className="hover:text-brand-700 break-all">
                {customer.email}
              </a>
            </DetailRow>
            <DetailRow label="Email verified">
              {customer.isEmailVerified ? (
                <span className="text-leaf-700">Yes</span>
              ) : (
                <span className="text-ink-400">Not yet</span>
              )}
            </DetailRow>
            <DetailRow label="Phone">
              {customer.phone ? (
                <a href={`tel:${customer.phone}`} className="tnum hover:text-brand-700">
                  {customer.phone}
                </a>
              ) : (
                '—'
              )}
            </DetailRow>
            <DetailRow label="Last signed in">{formatDateTime(customer.lastLoginAt)}</DetailRow>
            <DetailRow label="Newsletter">
              {customer.acceptsMarketing ? 'Subscribed' : 'Not subscribed'}
            </DetailRow>
          </dl>
        </Panel>

        <Panel title="Saved addresses" className="lg:col-span-2" bodyClassName="p-0">
          {customer.addresses?.length ? (
            <ul className="divide-cream-200 divide-y">
              {customer.addresses.map((address, index) => (
                <li key={address._id ?? index} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{address.label || 'Address'}</p>
                    {address.isDefault ? (
                      <span className="badge border-brand-200 bg-brand-50 text-brand-800 border text-[0.6875rem]">
                        Default
                      </span>
                    ) : null}
                  </div>
                  <p className="text-ink-600 mt-0.5 text-sm">{addressLine(address)}</p>
                  <p className="text-ink-400 tnum mt-0.5 text-xs">
                    {address.fullName} · {address.phone}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-500 px-4 py-6 text-center text-sm">
              No saved addresses. This customer types one in at checkout each time.
            </p>
          )}
        </Panel>

        <Panel
          title="Order history"
          className="lg:col-span-3"
          bodyClassName="p-0"
          actions={
            <Link to={`/admin/orders?q=${encodeURIComponent(customer.email)}`} className="btn-ghost btn-sm">
              All orders
            </Link>
          }
        >
          {orders?.length ? (
            <div className="overflow-x-auto">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Order</th>
                    <th scope="col" className="hidden sm:table-cell">
                      Placed
                    </th>
                    <th scope="col" className="text-right">
                      Items
                    </th>
                    <th scope="col" className="text-right">
                      Total
                    </th>
                    <th scope="col">Payment</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order._id}>
                      <td>
                        <Link
                          to={`/admin/orders/${order._id}`}
                          className="text-ink-900 hover:text-brand-700 font-mono text-sm font-medium"
                        >
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="text-ink-500 hidden text-xs whitespace-nowrap sm:table-cell">
                        {formatDate(order.createdAt)}
                      </td>
                      <td className="tnum text-right text-sm">{order.itemCount}</td>
                      <td className="tnum text-right text-sm font-semibold whitespace-nowrap">
                        {formatPrice(order.pricing?.total)}
                      </td>
                      <td>
                        <PaymentBadge
                          status={order.paymentStatus}
                          method={order.paymentMethod}
                        />
                      </td>
                      <td>
                        <StatusBadge status={order.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-ink-500 px-4 py-6 text-center text-sm">
              This customer has not ordered yet.
            </p>
          )}
        </Panel>
      </div>

      <Modal
        open={confirmBlock}
        onClose={() => setConfirmBlock(false)}
        title="Block this account?"
        size="sm"
        footer={
          <>
            <button type="button" onClick={() => setConfirmBlock(false)} className="btn-outline btn-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setActive.run(false)}
              disabled={setActive.pending}
              className="btn btn-sm bg-red-600 text-white hover:bg-red-700"
            >
              {setActive.pending ? <Spinner className="size-4" /> : null}
              Block
            </button>
          </>
        }
      >
        <p className="text-ink-600 text-sm">
          <strong className="text-ink-900">{customer.name}</strong> will no longer be able to sign
          in. Their existing sessions are revoked.
        </p>
        <p className="text-ink-500 mt-2 text-sm">
          Orders already placed are not cancelled. This can be undone at any time.
        </p>
      </Modal>
    </>
  );
}
