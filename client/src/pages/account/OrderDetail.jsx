import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import Spinner, { PageLoader } from '../../components/ui/Spinner';
import { ErrorState } from '../../components/ui/EmptyState';
import StatusBadge, { PaymentBadge } from '../../components/admin/StatusBadge';
import { Modal, Panel } from '../../components/admin/AdminPage';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import { useFetch, useMutation } from '../../hooks/useApi';
import useSeo from '../../hooks/useSeo';
import { API_BASE, post } from '../../lib/apiClient';
import { addressLine, formatDateTime, formatPrice } from '../../lib/format';

/**
 * One order, in full.
 *
 * Reached by order *number* because that is what the customer has; cancelling posts to
 * `/orders/:id/cancel`, which takes the Mongo id, so it is read off the fetched document
 * rather than guessed from the URL.
 *
 * Nothing on this page decides anything. Whether it can be cancelled is the server's
 * `isCancellable` virtual, whether it can be paid again is `canRetryPayment`, and the
 * money is `order.pricing` as written at checkout. Recomputing any of that here would
 * eventually disagree with the database, and the customer would believe this page.
 */
export default function OrderDetail() {
  const { orderNumber } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { addItem } = useCart();

  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [reordering, setReordering] = useState(false);

  useSeo({ title: `Order ${orderNumber}`, noIndex: true });

  const { data, error, loading, refetch } = useFetch(`/orders/${orderNumber}`);
  const order = data?.order;
  const payment = data?.payment;

  const cancel = useMutation((body) => post(`/orders/${order._id}/cancel`, body), {
    onSuccess: () => {
      toast.success('Your order has been cancelled');
      setConfirming(false);
      refetch();
    },
    onError: (normalised) => toast.error(normalised.message),
  });

  /**
   * Adds the same lines back to the bag. Not a server-side "reorder" - prices and stock
   * may both have moved since, and the cart is the one place that reprices honestly. Any
   * line that is gone or out of stock fails its own request and is reported, rather than
   * failing the whole basket.
   */
  const reorder = async () => {
    setReordering(true);
    let added = 0;
    let skipped = 0;

    for (const item of order.items) {
      try {
        await addItem({
          productId: String(item.product),
          variantId: String(item.variantId),
          quantity: item.quantity,
        });
        added += 1;
      } catch {
        skipped += 1;
      }
    }

    setReordering(false);
    if (added) {
      toast.success(
        skipped
          ? `Added ${added} back to your bag. ${skipped} ${skipped === 1 ? 'is' : 'are'} no longer available.`
          : 'Added back to your bag'
      );
      navigate('/cart');
    } else {
      toast.error('None of these are available at the moment.');
    }
  };

  if (loading) return <PageLoader label="Fetching your order" />;

  if (error || !order) {
    return (
      <div className="card p-5">
        <ErrorState error={error} onRetry={refetch} />
        <p className="text-ink-500 mt-4 text-center text-sm">
          <Link to="/account/orders" className="text-brand-700 underline">
            Back to your orders
          </Link>
        </p>
      </div>
    );
  }

  const invoiceHref = `${API_BASE}/orders/${order.orderNumber}/invoice`;

  return (
    <div>
      <Link
        to="/account/orders"
        className="text-ink-500 hover:text-ink-800 inline-flex items-center gap-1.5 text-sm"
      >
        <Icon name="arrowLeft" className="size-4" />
        All orders
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="tnum text-2xl sm:text-3xl">{order.orderNumber}</h1>
          <p className="text-ink-400 mt-1 text-sm">Placed {formatDateTime(order.createdAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={order.status} />
          <PaymentBadge status={order.paymentStatus} method={order.paymentMethod} />
        </div>
      </div>

      {/* --- Outstanding payment ---------------------------------------- */}
      {data.canRetryPayment ? (
        <div className="border-mustard-200 bg-mustard-50 mt-4 rounded-xl border p-4">
          <p className="text-mustard-900 text-sm font-medium">This order is waiting on payment.</p>
          <p className="text-mustard-900 mt-1 text-sm">
            {payment?.failureReason
              ? `The last attempt failed: ${payment.failureReason}.`
              : 'We have not had a confirmed payment yet.'}{' '}
            Your jars stay reserved for a short while.
          </p>
          <Link
            to={`/payment-failed?order=${encodeURIComponent(order.orderNumber)}&status=pending`}
            className="btn-primary btn-sm mt-3"
          >
            <Icon name="wallet" className="size-4" />
            Pay now
          </Link>
        </div>
      ) : null}

      {order.status === 'cancelled' && order.cancelReason ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Cancelled — {order.cancelReason}
          {order.paymentStatus === 'refunded' ? (
            <>
              {' '}
              A refund of{' '}
              <span className="tnum font-medium">{formatPrice(order.refundAmount ?? 0)}</span> has
              been recorded. Bank transfers can take a few working days to appear.
            </>
          ) : null}
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {/* --- Items + money ------------------------------------------- */}
        <div className="space-y-4 lg:col-span-2">
          <Panel title="What you ordered" bodyClassName="">
            <ul className="divide-cream-200 divide-y">
              {order.items.map((item, index) => (
                <li key={`${item.sku ?? item.name}-${index}`} className="flex gap-3 p-4">
                  <span className="bg-cream-200 size-16 shrink-0 overflow-hidden rounded-lg">
                    {item.image?.url ? (
                      <img
                        src={item.image.url}
                        alt={item.image.alt ?? item.name}
                        className="size-full object-cover"
                        loading="lazy"
                      />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <Link
                      to={`/product/${item.slug}`}
                      className="block text-sm font-medium hover:underline"
                    >
                      {item.name}
                    </Link>
                    <span className="text-ink-500 block text-xs">
                      {item.size}
                      {item.sku ? ` · ${item.sku}` : ''}
                    </span>
                    <span className="text-ink-500 tnum mt-1 block text-xs">
                      {item.quantity} × {formatPrice(item.unitPrice)}
                      {item.listPrice > item.unitPrice ? (
                        <span className="text-ink-400 ml-1.5 line-through">
                          {formatPrice(item.listPrice)}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="tnum text-sm font-medium">{formatPrice(item.lineTotal)}</span>
                </li>
              ))}
            </ul>

            <dl className="border-cream-300 space-y-1.5 border-t p-4 text-sm">
              <Row label="Subtotal" value={formatPrice(order.pricing.subtotal)} />
              {order.pricing.itemDiscount > 0 ? (
                <Row
                  label="Item discounts"
                  value={`− ${formatPrice(order.pricing.itemDiscount)}`}
                  tone="leaf"
                />
              ) : null}
              {order.pricing.couponDiscount > 0 ? (
                <Row
                  label={`Coupon ${order.coupon?.code ?? ''}`}
                  value={`− ${formatPrice(order.pricing.couponDiscount)}`}
                  tone="leaf"
                />
              ) : null}
              <Row
                label="Delivery"
                value={
                  order.pricing.deliveryCharge > 0
                    ? formatPrice(order.pricing.deliveryCharge)
                    : 'Free'
                }
              />
              {order.pricing.taxAmount > 0 ? (
                <Row
                  label={`VAT (${order.pricing.taxRate}%)`}
                  value={formatPrice(order.pricing.taxAmount)}
                />
              ) : null}
              <div className="border-cream-300 flex items-baseline justify-between border-t pt-2">
                <dt className="font-semibold">Total</dt>
                <dd className="tnum text-lg font-semibold">{formatPrice(order.pricing.total)}</dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Progress" bodyClassName="p-4">
            <ol className="space-y-4">
              {(order.timeline ?? []).map((entry, index) => (
                <li key={`${entry.status}-${index}`} className="flex gap-3">
                  <span
                    className={`mt-1 size-2.5 shrink-0 rounded-full ${
                      ['cancelled', 'refunded'].includes(entry.status)
                        ? 'bg-red-500'
                        : 'bg-leaf-500'
                    }`}
                  />
                  <span className="min-w-0 text-sm">
                    <StatusBadge status={entry.status} />
                    <span className="text-ink-400 mt-1 block text-xs">
                      {formatDateTime(entry.at)}
                      {entry.byName ? ` · ${entry.byName}` : ''}
                    </span>
                    {entry.note ? (
                      <span className="text-ink-600 mt-0.5 block text-xs">{entry.note}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        {/* --- Aside --------------------------------------------------- */}
        <div className="space-y-4">
          <Panel title="Delivery" bodyClassName="p-4 text-sm">
            <p className="font-medium">{order.shippingAddress.fullName}</p>
            <p className="text-ink-500">{addressLine(order.shippingAddress)}</p>
            <p className="text-ink-500 tnum">{order.shippingAddress.phone}</p>
            {order.shippingAddress.landmark ? (
              <p className="text-ink-400 mt-1 text-xs">
                Landmark: {order.shippingAddress.landmark}
              </p>
            ) : null}

            {order.delivery?.trackingNumber ? (
              <p className="border-cream-300 mt-3 border-t pt-3 text-xs">
                {order.delivery.courier ? `${order.delivery.courier} · ` : ''}
                <span className="tnum font-medium">{order.delivery.trackingNumber}</span>
              </p>
            ) : null}
            {order.customerNote ? (
              <p className="border-cream-300 text-ink-500 mt-3 border-t pt-3 text-xs">
                Your note: {order.customerNote}
              </p>
            ) : null}
          </Panel>

          <Panel title="Payment" bodyClassName="p-4 text-sm">
            <dl className="space-y-1.5">
              <Row
                label="Method"
                value={
                  order.paymentMethod === 'cod'
                    ? 'Cash on delivery'
                    : order.paymentMethod === 'khalti'
                      ? 'Khalti'
                      : 'eSewa'
                }
              />
              {payment?.transactionId ? (
                <Row
                  label="Transaction"
                  value={<span className="tnum text-xs">{payment.transactionId}</span>}
                />
              ) : null}
              {payment?.paidAt ? <Row label="Paid" value={formatDateTime(payment.paidAt)} /> : null}
            </dl>

            {order.paymentStatus === 'paid' || order.paymentMethod === 'cod' ? (
              <a
                href={invoiceHref}
                target="_blank"
                rel="noreferrer"
                className="btn-outline btn-sm mt-3 w-full"
              >
                <Icon name="download" className="size-4" />
                Invoice
              </a>
            ) : null}
          </Panel>

          <div className="space-y-2">
            <button
              type="button"
              onClick={reorder}
              disabled={reordering}
              className="btn-secondary w-full"
            >
              {reordering ? <Spinner className="size-4" /> : <Icon name="cart" className="size-4" />}
              Order this again
            </button>

            {order.status === 'delivered' ? (
              <Link to="/account/reviews" className="btn-outline w-full">
                <Icon name="star" className="size-4" />
                Review these
              </Link>
            ) : null}

            {order.isCancellable ? (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="btn-ghost w-full text-red-700"
              >
                Cancel this order
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* --- Cancel confirmation ------------------------------------------ */}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Cancel this order?"
        footer={
          <>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="btn-outline"
              disabled={cancel.pending}
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={() => cancel.run({ reason: reason.trim() || undefined }).catch(() => {})}
              className="btn-danger"
              disabled={cancel.pending}
            >
              {cancel.pending ? <Spinner className="size-4" /> : null}
              Cancel the order
            </button>
          </>
        }
      >
        <p className="text-ink-600 text-sm">
          {order.orderNumber} for{' '}
          <span className="tnum font-medium">{formatPrice(order.pricing.total)}</span> will be
          cancelled and the jars returned to stock.
        </p>
        {order.paymentStatus === 'paid' ? (
          <p className="border-mustard-200 bg-mustard-50 text-mustard-900 mt-3 rounded-lg border px-3 py-2 text-sm">
            This order is already paid. We will record a refund of{' '}
            {formatPrice(order.pricing.total)} and get in touch about returning it to your Khalti
            or eSewa account — that part is not automatic.
          </p>
        ) : null}

        <label className="mt-4 block">
          <span className="field-label">Why, if you do not mind saying? (optional)</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={300}
            className="field-input"
            placeholder="Ordered by mistake, changed my mind…"
          />
        </label>

        {cancel.error ? (
          <p className="mt-3 text-sm text-red-700">{cancel.error.message}</p>
        ) : null}
      </Modal>
    </div>
  );
}

function Row({ label, value, tone }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className={`tnum ${tone === 'leaf' ? 'text-leaf-700' : 'text-ink-800'}`}>{value}</dd>
    </div>
  );
}
