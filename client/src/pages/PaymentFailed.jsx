import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../components/ui/Icon';
import Spinner, { PageLoader } from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';
import StatusBadge, { PaymentBadge } from '../components/admin/StatusBadge';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useApi';
import useSeo from '../hooks/useSeo';
import { apiError, post } from '../lib/apiClient';
import { orderToken } from '../lib/guestOrders';
import { formatPrice } from '../lib/format';

/**
 * Payment failed, cancelled or expired.
 *
 * The API redirects here from a gateway callback it could not verify, using exactly the
 * shape `clientRedirect` builds: `/payment-failed?order=ACH-…&status=failed&reason=…`.
 * Those parameters are display copy only. Whether the order can actually be paid again is
 * `canRetryPayment` from `GET /api/orders/:orderNumber`, computed server-side from the
 * order's own state - so a hand-edited `?status=paid` changes nothing but a heading, and
 * a hand-edited `?status=failed` on a paid order shows the paid state anyway.
 *
 * Retrying starts a *new* payment attempt against the same order. `Payment.attempt` is
 * incremented server-side and each attempt carries its own gateway reference, so a
 * customer whose first attempt times out and then succeeds does not end up with two
 * orders, and a late callback for the abandoned attempt cannot pay for the order twice.
 */

const REASON_COPY = {
  cancelled: 'The payment was cancelled before it completed.',
  failed: 'The gateway could not complete this payment.',
  expired: 'The payment window closed before it was confirmed.',
  pending: 'This payment has not been confirmed yet.',
};

export default function PaymentFailed() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { settings } = useSettings();

  const orderNumber = params.get('order');
  const status = params.get('status') ?? 'failed';
  const reason = params.get('reason');

  const token = orderToken(orderNumber);
  const [retrying, setRetrying] = useState('');

  useSeo({ title: 'Payment unsuccessful', noIndex: true });

  const { data, error, loading, refetch } = useFetch(
    orderNumber ? `/orders/${orderNumber}` : null,
    { params: token ? { token } : undefined, skip: !orderNumber }
  );

  const order = data?.order;
  const payment = data?.payment;
  const gateways = settings?.payments?.gateways ?? [];

  /**
   * Starts a fresh attempt. Identical to the checkout hand-off, deliberately: same
   * endpoint, same two shapes of provider result, so there is one code path that can
   * begin a payment and it is server-driven.
   */
  const retry = async (gateway) => {
    setRetrying(gateway);
    try {
      const result = await post('/payments/initiate', {
        orderNumber,
        gateway,
        token,
      });

      if (result.method === 'redirect') {
        window.location.assign(result.redirectUrl);
        return;
      }
      navigate('/payment/redirect', {
        state: {
          formUrl: result.formUrl,
          fields: result.fields,
          orderNumber,
          gateway,
        },
      });
    } catch (caught) {
      toast.error(apiError(caught).message);
      setRetrying('');
    }
  };

  if (!orderNumber) {
    return (
      <div className="container-page py-10">
        <div className="card">
          <EmptyState
            icon="alert"
            title="That payment did not go through"
            description={
              reason ||
              'We did not receive a confirmed payment, and we could not tell which order it belonged to. Nothing has been charged.'
            }
            action="Back to your bag"
            actionTo="/cart"
            secondary={
              <Link to="/track-order" className="btn-outline">
                Look up an order
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  if (loading) return <PageLoader label="Checking this order" />;

  // Paid after all: a late-verifying callback, or a customer who paid in a second tab.
  if (order?.paymentStatus === 'paid') {
    return (
      <div className="container-page py-10">
        <div className="card mx-auto max-w-lg p-6 text-center">
          <span className="bg-leaf-100 mx-auto grid size-14 place-items-center rounded-full">
            <Icon name="checkCircle" className="text-leaf-700 size-7" />
          </span>
          <h1 className="mt-4 text-xl">This one is already paid</h1>
          <p className="text-ink-500 mt-2 text-sm">
            Order <span className="tnum font-medium">{orderNumber}</span> was confirmed
            {payment?.transactionId ? (
              <>
                {' '}
                under transaction <span className="tnum">{payment.transactionId}</span>
              </>
            ) : null}
            . Nothing further is needed.
          </p>
          <Link to={`/order-success/${orderNumber}`} className="btn-primary mt-5">
            See your order
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-6 sm:py-10">
      <div className="mx-auto max-w-lg">
        <div className="card p-5 text-center sm:p-6">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-red-100">
            <Icon name="alert" className="size-7 text-red-700" />
          </span>

          <h1 className="mt-4 text-xl sm:text-2xl">
            {status === 'cancelled' ? 'Payment cancelled' : 'Payment did not go through'}
          </h1>

          <p className="text-ink-500 mt-2 text-sm">
            {REASON_COPY[status] ?? REASON_COPY.failed}{' '}
            <strong className="text-ink-700 font-medium">
              You have not been charged for a payment we could not verify.
            </strong>
          </p>

          {/* The gateway's own words, when it gave any. Rendered as text, never as HTML. */}
          {(reason || payment?.failureReason) && (
            <p className="border-cream-300 text-ink-600 mt-3 rounded-xl border bg-cream-50 p-3 text-left text-sm">
              <span className="text-ink-400 block text-xs">Reported reason</span>
              {reason || payment?.failureReason}
            </p>
          )}

          <div className="border-cream-300 mt-5 border-t pt-4 text-left">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-ink-500 text-sm">Order</span>
              <span className="tnum text-sm font-medium">{orderNumber}</span>
            </div>
            {order ? (
              <>
                <div className="mt-1.5 flex items-baseline justify-between gap-3">
                  <span className="text-ink-500 text-sm">Amount</span>
                  <span className="tnum text-sm font-medium">
                    {formatPrice(order.pricing.total)}
                  </span>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <StatusBadge status={order.status} />
                  <PaymentBadge status={order.paymentStatus} method={order.paymentMethod} />
                </div>
              </>
            ) : null}
          </div>

          {/* --- Retry ---------------------------------------------------- */}
          {data?.canRetryPayment ? (
            <div className="mt-5">
              <p className="text-ink-600 text-sm">
                Your jars are still reserved. Try again with:
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {gateways.map((gateway) => (
                  <button
                    key={gateway}
                    type="button"
                    onClick={() => retry(gateway)}
                    disabled={Boolean(retrying)}
                    className={gateway === order?.paymentMethod ? 'btn-primary' : 'btn-outline'}
                  >
                    {retrying === gateway ? (
                      <Spinner className="size-4" />
                    ) : (
                      <Icon name="wallet" className="size-4" />
                    )}
                    {gateway === 'khalti' ? 'Khalti' : 'eSewa'}
                  </button>
                ))}
              </div>
              {!gateways.length ? (
                <p className="text-mustard-900 mt-2 text-sm">
                  No online gateway is available right now. Please get in touch and we will
                  arrange it.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="mt-5">
              <p className="text-ink-600 text-sm">
                {order && ['cancelled', 'refunded'].includes(order.status)
                  ? 'This order has been closed, so it can no longer be paid. Place a new one whenever you are ready.'
                  : 'This order can no longer be paid online. Get in touch and we will sort it out with you.'}
              </p>
              <Link to="/shop" className="btn-primary mt-3">
                Back to the shop
              </Link>
            </div>
          )}

          {error ? (
            <p className="text-ink-400 mt-4 text-xs">
              We could not load the full order here.{' '}
              <button type="button" onClick={refetch} className="underline">
                Try again
              </button>{' '}
              or look it up on the{' '}
              <Link to="/track-order" className="underline">
                tracking page
              </Link>
              .
            </p>
          ) : null}
        </div>

        <div className="text-ink-500 mt-5 text-center text-sm">
          <p>
            Still stuck? Call{' '}
            <a href={`tel:${settings?.company?.phone ?? ''}`} className="text-brand-700 underline">
              {settings?.company?.phone || 'our support line'}
            </a>{' '}
            and quote <span className="tnum">{orderNumber}</span> - we can also take cash on
            delivery.
          </p>
        </div>
      </div>
    </div>
  );
}
