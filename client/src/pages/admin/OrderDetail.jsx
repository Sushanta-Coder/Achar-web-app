import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import Spinner, { PageLoader } from '../../components/ui/Spinner';
import { ErrorState } from '../../components/ui/EmptyState';
import StatusBadge, {
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PaymentBadge,
} from '../../components/admin/StatusBadge';
import { DetailRow, PageHeader, Panel } from '../../components/admin/AdminPage';
import { useFetch, useMutation } from '../../hooks/useApi';
import { patch } from '../../lib/apiClient';
import { useToast } from '../../context/ToastContext';
import useSeo from '../../hooks/useSeo';
import { addressLine, formatDateTime, formatPhone, formatPrice } from '../../lib/format';

/**
 * One order: what was bought, who for, what has been paid, and what happens next.
 *
 * The status dropdown is populated from `allowedTransitions`, which the API derives from
 * `ORDER_STATUS_TRANSITIONS`. This screen therefore cannot offer an illegal change - not
 * because it knows the rules, but because it does not. The server would reject a bad
 * transition anyway (`Cannot move an order from Pending to Delivered`); this keeps the
 * dropdown honest so staff never see that error.
 *
 * Tracking is saved through the same status update, because in practice you enter a
 * tracking number at the moment you mark something shipped. It persists to
 * `order.delivery.trackingNumber` / `.courier`.
 */
export default function AdminOrderDetail() {
  const { id } = useParams();
  const toast = useToast();

  const { data, loading, error, refetch } = useFetch(`/orders/admin/${id}`);
  const order = data?.order;

  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [courier, setCourier] = useState('');
  const [adminNote, setAdminNote] = useState('');

  // Seed the form from the order once it lands, and again after each refetch so the
  // fields reflect what is actually stored rather than what was last typed.
  useEffect(() => {
    if (!order) return;
    setStatus('');
    setNote('');
    setTrackingNumber(order.delivery?.trackingNumber ?? '');
    setCourier(order.delivery?.courier ?? '');
    setAdminNote(order.adminNote ?? '');
  }, [order]);

  useSeo({
    title: order ? `${order.orderNumber} · Orders` : 'Order · Admin',
    noIndex: true,
  });

  const statusUpdate = useMutation((body) => patch(`/orders/admin/${id}/status`, body), {
    onSuccess: (result) => {
      toast.success(`Order marked as ${ORDER_STATUS_LABELS[result.order.status]}`);
      refetch();
    },
    onError: (normalised) => toast.error(normalised.message),
  });

  const noteUpdate = useMutation((body) => patch(`/orders/admin/${id}/note`, body), {
    onSuccess: () => toast.success('Note saved'),
    onError: (normalised) => toast.error(normalised.message),
  });

  const submitStatus = async (event) => {
    event.preventDefault();
    if (!status) return;
    try {
      await statusUpdate.run({
        status,
        note: note.trim() || undefined,
        trackingNumber: trackingNumber.trim() || undefined,
        courier: courier.trim() || undefined,
      });
    } catch {
      // Reported by onError; the form stays as typed so nothing is lost.
    }
  };

  const saveTrackingOnly = async () => {
    // No status change wanted - reapply the current status so the update goes through
    // the same service path (and lands in the timeline) without a transition.
    try {
      await statusUpdate.run({
        status: order.status,
        trackingNumber: trackingNumber.trim() || undefined,
        courier: courier.trim() || undefined,
      });
    } catch {
      /* reported */
    }
  };

  if (loading) return <PageLoader label="Loading order" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!order) return null;

  const allowed = data.allowedTransitions ?? [];
  const pricing = order.pricing ?? {};
  const trackingChanged =
    trackingNumber !== (order.delivery?.trackingNumber ?? '') ||
    courier !== (order.delivery?.courier ?? '');

  return (
    <>
      <PageHeader
        title={order.orderNumber}
        breadcrumb={[{ label: 'Orders', to: '/admin/orders' }, { label: order.orderNumber }]}
        description={`Placed ${formatDateTime(order.createdAt)}${order.isGuest ? ' · guest checkout' : ''}`}
        actions={
          <>
            <a
              href={`/api/orders/${order.orderNumber}/invoice`}
              target="_blank"
              rel="noreferrer"
              className="btn-outline btn-sm"
            >
              <Icon name="download" className="size-4" />
              Invoice
            </a>
            <button type="button" onClick={refetch} className="btn-outline btn-sm">
              <Icon name="refresh" className="size-4" />
              Refresh
            </button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={order.status} />
        <PaymentBadge status={order.paymentStatus} method={order.paymentMethod} />
        {order.delivery?.trackingNumber ? (
          <span className="badge border-cream-400 bg-cream-100 text-ink-600 border">
            <Icon name="truck" className="size-3.5" />
            {order.delivery.trackingNumber}
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* --- Left column: what was ordered --- */}
        <div className="space-y-4 lg:col-span-2">
          <Panel title={`Items (${order.items?.length ?? 0})`} bodyClassName="p-0">
            <ul className="divide-cream-200 divide-y">
              {(order.items ?? []).map((item, index) => (
                <li key={item._id ?? index} className="flex items-center gap-3 p-3.5">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt=""
                      loading="lazy"
                      className="bg-cream-200 size-14 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="bg-cream-200 text-ink-400 grid size-14 shrink-0 place-items-center rounded-lg">
                      <Icon name="box" className="size-6" />
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-ink-900 truncate text-sm font-medium">{item.name}</p>
                    <p className="text-ink-400 text-xs">
                      {item.size ? `${item.size} · ` : ''}
                      {item.sku}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="tnum text-sm font-semibold">{formatPrice(item.lineTotal)}</p>
                    <p className="text-ink-400 tnum text-xs">
                      {formatPrice(item.price)} × {item.quantity}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            {/*
              Every figure here was calculated server-side and stored on the order. The
              admin UI displays them; it does not recompute a total from the lines, which
              would let a rounding difference show staff a number the customer never paid.
            */}
            <dl className="border-cream-300 bg-cream-50 border-t px-4 py-3">
              <DetailRow label="Items subtotal">{formatPrice(pricing.subtotal)}</DetailRow>
              {pricing.itemDiscount > 0 ? (
                <DetailRow label="Product discounts" className="text-leaf-700">
                  −{formatPrice(pricing.itemDiscount)}
                </DetailRow>
              ) : null}
              {pricing.couponDiscount > 0 ? (
                <DetailRow label={`Coupon ${order.coupon?.code ?? ''}`} className="text-leaf-700">
                  −{formatPrice(pricing.couponDiscount)}
                </DetailRow>
              ) : null}
              <DetailRow label="Delivery">
                {pricing.deliveryCharge > 0 ? formatPrice(pricing.deliveryCharge) : 'Free'}
              </DetailRow>
              {pricing.taxAmount > 0 ? (
                <DetailRow label={`Tax (${pricing.taxRate}%)`}>
                  {formatPrice(pricing.taxAmount)}
                </DetailRow>
              ) : null}
              <div className="border-cream-300 mt-1.5 flex items-center justify-between border-t pt-2.5">
                <span className="font-semibold">Total</span>
                <span className="tnum text-lg font-bold">{formatPrice(pricing.total)}</span>
              </div>
            </dl>
          </Panel>

          {/* --- Status + tracking --- */}
          <Panel title="Update this order">
            {allowed.length ? (
              <form onSubmit={submitStatus} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="status" className="field-label">
                      Move to
                    </label>
                    <select
                      id="status"
                      value={status}
                      onChange={(event) => setStatus(event.target.value)}
                      className="field-input"
                    >
                      <option value="">Keep as {ORDER_STATUS_LABELS[order.status]}</option>
                      {allowed.map((value) => (
                        <option key={value} value={value}>
                          {ORDER_STATUS_LABELS[value] ?? value}
                        </option>
                      ))}
                    </select>
                    <p className="field-hint">
                      Only the changes that are legal from {ORDER_STATUS_LABELS[order.status]} are
                      listed.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="note" className="field-label">
                      Note for the timeline <span className="text-ink-400">(optional)</span>
                    </label>
                    <input
                      id="note"
                      type="text"
                      maxLength={400}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Handed to courier at 4pm"
                      className="field-input"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="trackingNumber" className="field-label">
                      Tracking number
                    </label>
                    <input
                      id="trackingNumber"
                      type="text"
                      maxLength={60}
                      value={trackingNumber}
                      onChange={(event) => setTrackingNumber(event.target.value)}
                      placeholder="ACHTRK-0001"
                      className="field-input"
                    />
                  </div>
                  <div>
                    <label htmlFor="courier" className="field-label">
                      Courier
                    </label>
                    <input
                      id="courier"
                      type="text"
                      maxLength={60}
                      value={courier}
                      onChange={(event) => setCourier(event.target.value)}
                      placeholder="Aramex Nepal"
                      className="field-input"
                      list="courier-options"
                    />
                    <datalist id="courier-options">
                      <option value="Aramex Nepal" />
                      <option value="NCM (Nepal Can Move)" />
                      <option value="Pathao Courier" />
                      <option value="Upaya Courier" />
                      <option value="In-house rider" />
                    </datalist>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    disabled={!status || statusUpdate.pending}
                    className="btn-primary btn-sm"
                  >
                    {statusUpdate.pending ? <Spinner className="size-4" /> : null}
                    {status ? `Mark as ${ORDER_STATUS_LABELS[status]}` : 'Choose a status'}
                  </button>

                  {trackingChanged ? (
                    <button
                      type="button"
                      onClick={saveTrackingOnly}
                      disabled={statusUpdate.pending}
                      className="btn-outline btn-sm"
                    >
                      Save tracking only
                    </button>
                  ) : null}
                </div>
              </form>
            ) : (
              <p className="text-ink-500 text-sm">
                This order is {ORDER_STATUS_LABELS[order.status]} and cannot move any further.
              </p>
            )}
          </Panel>

          {/* --- Timeline --- */}
          <Panel title="History">
            {order.timeline?.length ? (
              <ol className="space-y-3">
                {[...order.timeline].reverse().map((entry, index) => (
                  <li key={index} className="flex gap-3">
                    <span className="bg-brand-100 text-brand-700 mt-0.5 grid size-7 shrink-0 place-items-center rounded-full">
                      <Icon name="check" className="size-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-ink-800 text-sm font-medium">
                        {ORDER_STATUS_LABELS[entry.status] ?? entry.status}
                      </p>
                      {entry.note ? <p className="text-ink-600 text-sm">{entry.note}</p> : null}
                      <p className="text-ink-400 text-xs">
                        {formatDateTime(entry.at)}
                        {entry.byName ? ` · ${entry.byName}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-ink-500 text-sm">Nothing recorded yet.</p>
            )}
          </Panel>
        </div>

        {/* --- Right column: who, where, how paid --- */}
        <div className="space-y-4">
          <Panel title="Customer">
            <dl>
              <DetailRow label="Name">{order.customer?.name}</DetailRow>
              <DetailRow label="Phone">
                <a href={`tel:${order.customer?.phone}`} className="text-brand-700 hover:underline">
                  {formatPhone(order.customer?.phone)}
                </a>
              </DetailRow>
              <DetailRow label="Email">
                <a
                  href={`mailto:${order.customer?.email}`}
                  className="text-brand-700 break-all hover:underline"
                >
                  {order.customer?.email}
                </a>
              </DetailRow>
              <DetailRow label="Account">
                {order.user ? (
                  <Link
                    to={`/admin/customers/${order.user._id}`}
                    className="text-brand-700 hover:underline"
                  >
                    {order.user.orderCount ?? 0} order
                    {(order.user.orderCount ?? 0) === 1 ? '' : 's'}
                  </Link>
                ) : (
                  'Guest checkout'
                )}
              </DetailRow>
            </dl>
          </Panel>

          <Panel title="Delivery address">
            <p className="text-ink-800 text-sm font-medium">{order.shippingAddress?.fullName}</p>
            <p className="text-ink-600 mt-1 text-sm leading-relaxed">
              {addressLine(order.shippingAddress)}
            </p>
            {order.shippingAddress?.landmark ? (
              <p className="text-ink-500 mt-1 text-xs">Landmark: {order.shippingAddress.landmark}</p>
            ) : null}
            {order.shippingAddress?.deliveryInstructions ? (
              <p className="text-ink-500 mt-1 text-xs">
                Instructions: {order.shippingAddress.deliveryInstructions}
              </p>
            ) : null}

            <dl className="border-cream-200 mt-3 border-t pt-2">
              <DetailRow label="Zone">{order.delivery?.zoneName ?? '—'}</DetailRow>
              <DetailRow label="Estimated">
                {order.delivery?.estimatedDaysMin
                  ? `${order.delivery.estimatedDaysMin}–${order.delivery.estimatedDaysMax} days`
                  : '—'}
              </DetailRow>
            </dl>
          </Panel>

          <Panel title="Payment">
            <dl>
              <DetailRow label="Method">
                {PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}
              </DetailRow>
              <DetailRow label="Status">
                <PaymentBadge status={order.paymentStatus} />
              </DetailRow>
              <DetailRow label="Paid at">
                {order.paidAt ? formatDateTime(order.paidAt) : 'Not yet'}
              </DetailRow>
              <DetailRow label="Stock">{order.stockState}</DetailRow>
            </dl>

            {data.payments?.length ? (
              <ul className="border-cream-200 mt-3 space-y-2 border-t pt-3">
                {data.payments.map((payment) => (
                  <li key={payment._id} className="text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-ink-700 font-medium capitalize">{payment.gateway}</span>
                      <span className="tnum">{formatPrice(payment.amount)}</span>
                    </div>
                    <p className="text-ink-400">
                      {payment.status}
                      {payment.attempt ? ` · attempt ${payment.attempt}` : ''} ·{' '}
                      {formatDateTime(payment.createdAt)}
                    </p>
                    {payment.transactionId ? (
                      <p className="text-ink-400 break-all">Txn {payment.transactionId}</p>
                    ) : null}
                    {payment.failureReason ? (
                      <p className="text-red-600">{payment.failureReason}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>

          {order.customerNote ? (
            <Panel title="Customer note">
              <p className="text-ink-700 text-sm">{order.customerNote}</p>
            </Panel>
          ) : null}

          <Panel title="Internal note">
            <textarea
              rows={4}
              maxLength={1000}
              value={adminNote}
              onChange={(event) => setAdminNote(event.target.value)}
              placeholder="Only staff can see this."
              className="field-input resize-y"
              aria-label="Internal note"
            />
            <button
              type="button"
              onClick={() => noteUpdate.run({ adminNote })}
              disabled={noteUpdate.pending || adminNote === (order.adminNote ?? '')}
              className="btn-outline btn-sm mt-2"
            >
              {noteUpdate.pending ? <Spinner className="size-4" /> : null}
              Save note
            </button>
          </Panel>
        </div>
      </div>
    </>
  );
}
