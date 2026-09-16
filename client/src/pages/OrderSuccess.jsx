import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import Icon from '../components/ui/Icon';
import Spinner, { PageLoader } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/EmptyState';
import StatusBadge, { PaymentBadge } from '../components/admin/StatusBadge';
import { useSettings } from '../context/SettingsContext';
import useSeo from '../hooks/useSeo';
import { API_BASE, apiError, get } from '../lib/apiClient';
import { orderToken } from '../lib/guestOrders';
import { addressLine, formatDate, formatDateTime, formatPrice } from '../lib/format';

/**
 * Order confirmation, reached two ways: straight after a COD checkout, or as the
 * gateway's landing page once `/api/payments/:gateway/callback` has verified the payment
 * and redirected here.
 *
 * The page never decides whether the order is paid. It asks the API, and the API answers
 * from its own records - `GET /api/payments/status/:orderNumber` reads our Payment
 * document and never contacts a gateway, which is why it is safe to poll. A `?status=`
 * or `?paid=` in the URL would be a lie waiting to happen, so none is read.
 *
 * Polling exists for one narrow case: a customer whose browser returns before the
 * callback transaction has committed. It stops after a handful of attempts and after the
 * payment settles either way, and it is never started for cash on delivery.
 */

const POLL_MS = 3000;
const MAX_POLLS = 8;

export default function OrderSuccess() {
  const { orderNumber } = useParams();
  const location = useLocation();
  const { settings } = useSettings();

  const token = orderToken(orderNumber, location.state?.accessToken);

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const attempts = useRef(0);

  useSeo({ title: `Order ${orderNumber}`, noIndex: true });

  const load = async () => {
    try {
      const result = await get(`/orders/${orderNumber}`, token ? { token } : undefined);
      setData(result);
      setError(null);
      return result;
    } catch (caught) {
      // Normalised, because ErrorState renders `error.message` and a raw Axios message
      // reads "Request failed with status code 403".
      setError(apiError(caught));
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNumber]);

  const order = data?.order;
  const payment = data?.payment;

  /**
   * Waits for a payment that is still settling. The condition is deliberately narrow:
   * an online order whose payment has not reached a terminal state. A COD order is
   * `pending` forever until the courier collects, so polling it would never stop.
   */
  const awaitingSettlement =
    order &&
    order.paymentMethod !== 'cod' &&
    order.paymentStatus === 'pending' &&
    !['cancelled', 'refunded'].includes(order.status);

  useEffect(() => {
    if (!awaitingSettlement || attempts.current >= MAX_POLLS) {
      setPolling(false);
      return;
    }
    setPolling(true);

    const timer = setTimeout(async () => {
      attempts.current += 1;
      try {
        const status = await get(
          `/payments/status/${orderNumber}`,
          token ? { token } : undefined
        );
        // Only a change worth re-rendering triggers a full reload.
        if (status?.paymentStatus && status.paymentStatus !== 'pending') await load();
        else setPolling(attempts.current < MAX_POLLS);
      } catch {
        // A failed poll is not a failed payment. Stop asking and let the customer refresh.
        attempts.current = MAX_POLLS;
        setPolling(false);
      }
    }, POLL_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingSettlement, data]);

  if (loading) return <PageLoader label="Fetching your order" />;

  if (error || !order) {
    return (
      <div className="container-page py-10">
        <div className="card p-5">
          <ErrorState error={error} onRetry={load} />
          <p className="text-ink-500 mt-4 text-sm">
            If you checked out as a guest and reopened this page in a new tab, look the order
            up with your phone number instead:{' '}
            <Link to="/track-order" className="text-brand-700 underline">
              track an order
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  const isPaid = order.paymentStatus === 'paid';
  const isCod = order.paymentMethod === 'cod';
  const settled = isPaid || isCod;
  // The invoice endpoint returns HTML for the browser's own print dialogue, so it is a
  // plain link rather than a fetch. Guests need their token on it.
  const invoiceHref = `${API_BASE}/orders/${order.orderNumber}/invoice${token ? `?token=${encodeURIComponent(token)}` : ''}`;

  return (
    <div className="container-page py-6 sm:py-10">
      <div className="mx-auto max-w-2xl">
        {/* --- Headline ---------------------------------------------------- */}
        <div className="text-center">
          <span
            className={`mx-auto grid size-16 place-items-center rounded-full ${
              settled ? 'bg-leaf-100' : 'bg-mustard-100'
            }`}
          >
            <Icon
              name={settled ? 'checkCircle' : 'clock'}
              className={settled ? 'text-leaf-700 size-8' : 'text-mustard-700 size-8'}
            />
          </span>

          <h1 className="mt-4 text-2xl sm:text-3xl">
            {settled ? 'Thank you - your order is in' : 'Your order is waiting on payment'}
          </h1>

          <p className="text-ink-500 mt-2">
            {isCod ? (
              <>
                Pay {formatPrice(order.pricing.total)} in cash when it arrives. We will call
                on {order.customer.phone} to confirm before dispatch.
              </>
            ) : isPaid ? (
              <>
                We have received {formatPrice(payment?.amount ?? order.pricing.total)} and a
                receipt is on its way to {order.customer.email}.
              </>
            ) : (
              <>
                We have not had a confirmed payment for this order yet. Nothing has been
                charged twice - you can retry below.
              </>
            )}
          </p>

          <p className="tnum text-ink-700 mt-4 text-lg font-medium">{order.orderNumber}</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <StatusBadge status={order.status} />
            <PaymentBadge status={order.paymentStatus} method={order.paymentMethod} />
            {polling ? (
              <span className="text-ink-400 flex items-center gap-1.5 text-xs">
                <Spinner className="size-3.5" />
                Checking with the gateway
              </span>
            ) : null}
          </div>
        </div>

        {/* --- Retry -------------------------------------------------------- */}
        {data.canRetryPayment ? (
          <div className="border-mustard-200 bg-mustard-50 mt-6 rounded-xl border p-4">
            <p className="text-mustard-900 text-sm font-medium">
              This order is being held for you.
            </p>
            <p className="text-mustard-900 mt-1 text-sm">
              {payment?.failureReason
                ? `The last attempt failed: ${payment.failureReason}.`
                : 'The payment was not completed.'}{' '}
              Stock stays reserved for a short while, so it is worth retrying now.
            </p>
            <Link
              to={`/payment-failed?order=${encodeURIComponent(order.orderNumber)}&status=pending`}
              className="btn-primary btn-sm mt-3"
            >
              <Icon name="refresh" className="size-4" />
              Retry payment
            </Link>
          </div>
        ) : null}

        {/* --- What happens next ------------------------------------------- */}
        <div className="card mt-6 p-4 sm:p-5">
          <h2 className="text-base">What happens next</h2>
          <ol className="mt-3 space-y-3 text-sm">
            <NextStep
              icon="checkCircle"
              done
              title={isCod ? 'Order received' : isPaid ? 'Payment confirmed' : 'Order received'}
              detail={formatDateTime(order.createdAt)}
            />
            <NextStep
              icon="box"
              done={['packed', 'shipped', 'out_for_delivery', 'delivered'].includes(order.status)}
              title="We pack your jars"
              detail="Sealed the day they ship, never in advance."
            />
            <NextStep
              icon="truck"
              done={['shipped', 'out_for_delivery', 'delivered'].includes(order.status)}
              title="Out for delivery"
              detail={
                order.delivery?.estimatedDeliveryDate
                  ? `Expected by ${formatDate(order.delivery.estimatedDeliveryDate)}`
                  : order.delivery?.zoneName
                    ? `${order.delivery.zoneName} · usually ${order.delivery.estimatedDaysMin ?? 1}-${order.delivery.estimatedDaysMax ?? 3} days`
                    : 'We will share a tracking number once it leaves us.'
              }
            />
            <NextStep
              icon="package"
              done={order.status === 'delivered'}
              title="Delivered"
              detail={
                order.deliveredAt
                  ? formatDateTime(order.deliveredAt)
                  : isCod
                    ? `Have ${formatPrice(order.pricing.total)} ready for the courier.`
                    : 'Open a jar the same day - achar is at its best fresh.'
              }
            />
          </ol>
        </div>

        {/* --- The order ---------------------------------------------------- */}
        <div className="card mt-4 p-4 sm:p-5">
          <h2 className="text-base">Your order</h2>

          <ul className="divide-cream-200 mt-3 divide-y">
            {(order.items ?? []).map((item, index) => (
              <li key={`${item.sku ?? item.name}-${index}`} className="flex gap-3 py-3">
                <span className="bg-cream-200 size-14 shrink-0 overflow-hidden rounded-lg">
                  {item.image?.url ? (
                    <img
                      src={item.image.url}
                      alt={item.image.alt ?? item.name}
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block font-medium">{item.name}</span>
                  <span className="text-ink-500 block text-xs">
                    {item.size} · {item.quantity} × {formatPrice(item.unitPrice)}
                  </span>
                </span>
                <span className="tnum text-sm font-medium">{formatPrice(item.lineTotal)}</span>
              </li>
            ))}
          </ul>

          <dl className="border-cream-300 mt-3 space-y-1.5 border-t pt-3 text-sm">
            <Row label="Subtotal" value={formatPrice(order.pricing.subtotal)} />
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
        </div>

        {/* --- Delivery + payment details ---------------------------------- */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="card p-4">
            <h2 className="text-base">Delivering to</h2>
            <p className="mt-2 text-sm font-medium">{order.shippingAddress.fullName}</p>
            <p className="text-ink-500 text-sm">{addressLine(order.shippingAddress)}</p>
            <p className="text-ink-500 tnum text-sm">{order.shippingAddress.phone}</p>
            {order.shippingAddress.landmark ? (
              <p className="text-ink-400 mt-1 text-xs">Landmark: {order.shippingAddress.landmark}</p>
            ) : null}
            {order.customerNote ? (
              <p className="border-cream-300 text-ink-500 mt-3 border-t pt-3 text-xs">
                Your note: {order.customerNote}
              </p>
            ) : null}
          </div>

          <div className="card p-4">
            <h2 className="text-base">Payment</h2>
            <dl className="mt-2 space-y-1.5 text-sm">
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
                <Row label="Transaction" value={<span className="tnum">{payment.transactionId}</span>} />
              ) : null}
              {payment?.paidAt ? <Row label="Paid" value={formatDateTime(payment.paidAt)} /> : null}
            </dl>
            {settled ? (
              <a
                href={invoiceHref}
                target="_blank"
                rel="noreferrer"
                className="btn-outline btn-sm mt-3"
              >
                <Icon name="download" className="size-4" />
                Invoice
              </a>
            ) : null}
          </div>
        </div>

        {/* --- Onward ------------------------------------------------------- */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link to="/shop" className="btn-primary">
            Keep shopping
          </Link>
          <Link to={`/track-order?order=${encodeURIComponent(order.orderNumber)}`} className="btn-outline">
            <Icon name="pin" className="size-4" />
            Track this order
          </Link>
        </div>

        <p className="text-ink-400 mt-6 text-center text-sm">
          Questions about this order? Call{' '}
          <a href={`tel:${settings?.company?.phone ?? ''}`} className="underline">
            {settings?.company?.phone || 'our support line'}
          </a>{' '}
          and quote <span className="tnum">{order.orderNumber}</span>.
        </p>
      </div>
    </div>
  );
}

function NextStep({ icon, title, detail, done }) {
  return (
    <li className="flex gap-3">
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-full ${
          done ? 'bg-leaf-100 text-leaf-700' : 'bg-cream-200 text-ink-400'
        }`}
      >
        <Icon name={icon} className="size-4" />
      </span>
      <span className="min-w-0">
        <span className={`block ${done ? 'font-medium' : 'text-ink-600'}`}>{title}</span>
        <span className="text-ink-400 block text-xs">{detail}</span>
      </span>
    </li>
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
