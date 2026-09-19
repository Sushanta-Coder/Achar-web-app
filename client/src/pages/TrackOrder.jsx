import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import Icon from '../components/ui/Icon';
import Spinner from '../components/ui/Spinner';
import StatusBadge, { PaymentBadge } from '../components/admin/StatusBadge';
import { useSettings } from '../context/SettingsContext';
import useSeo from '../hooks/useSeo';
import { apiError, post } from '../lib/apiClient';
import { addressLine, formatDate, formatDateTime, formatPrice } from '../lib/format';

/**
 * Order tracking without an account.
 *
 * Order numbers are sequential and printed on the packing slip, which makes them handy on
 * the phone and useless as a secret. So this asks for the order number *and* the phone or
 * email used at checkout: `POST /api/orders/track` matches on both and the endpoint is
 * rate-limited as the enumeration surface it is. Guessing ACH-2026-000124 gets you
 * nothing without the contact detail that goes with it.
 *
 * The timeline is the order's own `timeline` array - what actually happened and when, in
 * Nepal time - rather than a guess assembled from the current status. An order that was
 * cancelled after being packed shows both, in order, which is what a customer chasing a
 * refund needs to see.
 */

/** The happy path, for drawing the steps an order has not reached yet. */
const EXPECTED_FLOW = [
  { status: 'paid', label: 'Payment confirmed', icon: 'checkCircle' },
  { status: 'processing', label: 'Being prepared', icon: 'refresh' },
  { status: 'packed', label: 'Packed', icon: 'box' },
  { status: 'shipped', label: 'Handed to the courier', icon: 'package' },
  { status: 'out_for_delivery', label: 'Out for delivery', icon: 'truck' },
  { status: 'delivered', label: 'Delivered', icon: 'pin' },
];

export default function TrackOrder() {
  const [params, setParams] = useSearchParams();
  const { settings } = useSettings();

  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  useSeo({
    title: 'Track your order',
    description:
      'Check where your Deeva Achar order is. Enter your order number and the phone number or email you used at checkout.',
    canonical: '/track-order',
  });

  const { register, handleSubmit, setValue, setError: setFieldError, formState } = useForm({
    mode: 'onTouched',
    defaultValues: { orderNumber: params.get('order') ?? '', contact: '' },
  });

  // A link from the confirmation page carries `?order=`, so the field arrives filled in.
  useEffect(() => {
    const preset = params.get('order');
    if (preset) setValue('orderNumber', preset);
  }, [params, setValue]);

  const lookup = async (values) => {
    setPending(true);
    setError(null);
    try {
      const contact = values.contact.trim();
      // One input for both, because asking "phone or email?" as a radio button is a
      // question the form can answer itself. The API accepts either and requires one.
      const body = {
        orderNumber: values.orderNumber.trim().toUpperCase(),
        ...(contact.includes('@') ? { email: contact } : { phone: contact }),
      };

      const data = await post('/orders/track', body);
      setResult(data);

      // Keep the order number in the URL so a refresh does not lose the lookup, but never
      // the contact detail - that is not going in anyone's browser history.
      setParams({ order: body.orderNumber }, { replace: true });
    } catch (caught) {
      const normalised = apiError(caught);
      setResult(null);
      if (normalised.errors?.phone || normalised.errors?.email) {
        setFieldError('contact', { type: 'server', message: 'Enter the phone or email you used' });
      } else if (normalised.errors?.orderNumber) {
        setFieldError('orderNumber', { type: 'server', message: normalised.errors.orderNumber });
      } else {
        setError(normalised.message);
      }
    } finally {
      setPending(false);
    }
  };

  const order = result?.order;

  return (
    <div className="container-page py-6 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl sm:text-3xl">Track your order</h1>
        <p className="text-ink-500 mt-2 text-sm">
          Enter your order number and the phone number or email you used at checkout. No account
          needed.
        </p>

        <form onSubmit={handleSubmit(lookup)} className="card mt-5 p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Order number</span>
              <input
                {...register('orderNumber', {
                  required: 'Your order number is on your confirmation email',
                  pattern: {
                    value: /^ACH-\d{4}-\d{6}$/i,
                    message: 'It looks like ACH-2026-000123',
                  },
                })}
                className="field-input tnum uppercase"
                placeholder="ACH-2026-000123"
                autoComplete="off"
                spellCheck={false}
              />
              {formState.errors.orderNumber ? (
                <span className="field-error">{formState.errors.orderNumber.message}</span>
              ) : null}
            </label>

            <label className="block">
              <span className="field-label">Phone or email</span>
              <input
                {...register('contact', { required: 'We need this to confirm it is your order' })}
                className="field-input"
                placeholder="98XXXXXXXX"
                autoComplete="off"
              />
              {formState.errors.contact ? (
                <span className="field-error">{formState.errors.contact.message}</span>
              ) : (
                <span className="field-hint">Whichever you gave us at checkout.</span>
              )}
            </label>
          </div>

          <button type="submit" disabled={pending} className="btn-primary mt-4">
            {pending ? <Spinner className="size-5" /> : <Icon name="search" className="size-5" />}
            Find my order
          </button>

          {error ? (
            <p className="mt-3 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </form>

        {order ? (
          <>
            {/* --- Summary -------------------------------------------------- */}
            <div className="card mt-5 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="tnum text-lg font-medium">{order.orderNumber}</p>
                  <p className="text-ink-400 text-xs">
                    Placed {formatDateTime(order.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={order.status} />
                  <PaymentBadge status={order.paymentStatus} method={order.paymentMethod} />
                </div>
              </div>

              <dl className="border-cream-300 mt-4 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-ink-400 text-xs">Total</dt>
                  <dd className="tnum font-medium">{formatPrice(order.pricing.total)}</dd>
                </div>
                <div>
                  <dt className="text-ink-400 text-xs">Items</dt>
                  <dd className="font-medium">
                    {order.itemCount ??
                      (order.items ?? []).reduce((sum, item) => sum + item.quantity, 0)}{' '}
                    jars
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-400 text-xs">Delivering to</dt>
                  <dd>{addressLine(order.shippingAddress)}</dd>
                </div>
                <div>
                  <dt className="text-ink-400 text-xs">
                    {order.status === 'delivered' ? 'Delivered' : 'Expected'}
                  </dt>
                  <dd>
                    {order.deliveredAt
                      ? formatDateTime(order.deliveredAt)
                      : order.delivery?.estimatedDeliveryDate
                        ? `By ${formatDate(order.delivery.estimatedDeliveryDate)}`
                        : 'We will confirm once it ships'}
                  </dd>
                </div>
              </dl>

              {order.delivery?.trackingNumber ? (
                <p className="border-cream-300 mt-4 border-t pt-4 text-sm">
                  <Icon name="truck" className="text-ink-400 mr-1.5 inline size-4" />
                  {order.delivery.courier ? `${order.delivery.courier} · ` : ''}
                  tracking <span className="tnum font-medium">{order.delivery.trackingNumber}</span>
                </p>
              ) : null}
            </div>

            {/* --- Timeline ------------------------------------------------- */}
            <div className="card mt-4 p-4 sm:p-5">
              <h2 className="text-base">Progress</h2>
              <Timeline order={order} />
            </div>

            {/* --- Items ---------------------------------------------------- */}
            {order.items?.length ? (
              <div className="card mt-4 p-4 sm:p-5">
                <h2 className="text-base">What is in it</h2>
                <ul className="divide-cream-200 mt-2 divide-y">
                  {order.items.map((item, index) => (
                    <li key={`${item.sku ?? item.name}-${index}`} className="flex gap-3 py-3">
                      <span className="bg-cream-200 size-12 shrink-0 overflow-hidden rounded-lg">
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
                        <Link to={`/product/${item.slug}`} className="block font-medium hover:underline">
                          {item.name}
                        </Link>
                        <span className="text-ink-500 block text-xs">
                          {item.size} · {item.quantity} × {formatPrice(item.unitPrice)}
                        </span>
                      </span>
                      <span className="tnum text-sm">{formatPrice(item.lineTotal)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="text-ink-500 mt-5 text-center text-sm">
              Something not right? Call{' '}
              <a href={`tel:${settings?.company?.phone ?? ''}`} className="text-brand-700 underline">
                {settings?.company?.phone || 'our support line'}
              </a>{' '}
              with your order number.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * What happened, then what is still to come.
 *
 * The recorded half comes from `order.timeline`, so a cancellation or a status an admin
 * reversed is shown honestly. The remaining half is drawn from `EXPECTED_FLOW`, greyed
 * out, and suppressed entirely once an order is cancelled or refunded - promising "out
 * for delivery" on a cancelled order would be a lie.
 */
function Timeline({ order }) {
  const history = order.timeline ?? [];
  const done = new Set(history.map((entry) => entry.status));
  const closed = ['cancelled', 'refunded'].includes(order.status);

  const upcoming = closed
    ? []
    : EXPECTED_FLOW.filter(
        (step) => !done.has(step.status) && !(step.status === 'paid' && order.paymentMethod === 'cod')
      );

  return (
    <ol className="mt-3">
      {history.map((entry, index) => (
        <TimelineRow
          key={`${entry.status}-${entry.at}-${index}`}
          icon={
            entry.status === 'cancelled' || entry.status === 'refunded'
              ? 'close'
              : (EXPECTED_FLOW.find((step) => step.status === entry.status)?.icon ?? 'check')
          }
          title={
            EXPECTED_FLOW.find((step) => step.status === entry.status)?.label ??
            STATUS_TITLES[entry.status] ??
            entry.status
          }
          detail={entry.note}
          at={formatDateTime(entry.at)}
          tone={entry.status === 'cancelled' || entry.status === 'refunded' ? 'bad' : 'done'}
          last={index === history.length - 1 && !upcoming.length}
        />
      ))}

      {upcoming.map((step, index) => (
        <TimelineRow
          key={step.status}
          icon={step.icon}
          title={step.label}
          tone="pending"
          last={index === upcoming.length - 1}
        />
      ))}
    </ol>
  );
}

const STATUS_TITLES = {
  pending: 'Order placed',
  payment_pending: 'Awaiting payment',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

function TimelineRow({ icon, title, detail, at, tone, last }) {
  const dot =
    tone === 'bad'
      ? 'bg-red-100 text-red-700'
      : tone === 'done'
        ? 'bg-leaf-100 text-leaf-700'
        : 'bg-cream-200 text-ink-400';

  return (
    <li className="flex gap-3">
      <span className="flex flex-col items-center">
        <span className={`grid size-8 shrink-0 place-items-center rounded-full ${dot}`}>
          <Icon name={icon} className="size-4" />
        </span>
        {/* The connector, not drawn under the last row - it would dangle. */}
        {!last ? <span className="bg-cream-300 min-h-6 w-px flex-1" /> : null}
      </span>

      <span className={`min-w-0 pb-4 ${last ? 'pb-0' : ''}`}>
        <span className={`block text-sm ${tone === 'pending' ? 'text-ink-400' : 'font-medium'}`}>
          {title}
        </span>
        {at ? <span className="text-ink-400 block text-xs">{at}</span> : null}
        {detail ? <span className="text-ink-500 mt-0.5 block text-xs">{detail}</span> : null}
      </span>
    </li>
  );
}
