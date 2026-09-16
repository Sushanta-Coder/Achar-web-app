import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/ui/Icon';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import { useCart } from '../context/CartContext';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import useSeo from '../hooks/useSeo';
import { formatPrice } from '../lib/format';

/**
 * The bag.
 *
 * Every number on this page comes from the server's quote. `pricing.subtotal`,
 * `itemDiscount`, `couponDiscount`, `deliveryCharge` and `total` are read, never derived —
 * the closest this file gets to arithmetic is rendering `line.lineTotal`, which the server
 * calculated. That is the whole reason `CartContext` re-quotes after every change instead of
 * adjusting a local total: a cart that quietly recalculates in the browser is a cart that
 * can disagree with the invoice.
 *
 * `issues` and `removed` are surfaced rather than swallowed. When someone's 6 jars became 2
 * because stock moved while they were deciding, saying so is better than silently changing
 * the number under their cursor.
 */

export default function Cart() {
  const {
    items,
    quote,
    pricing,
    coupon,
    couponError,
    issues,
    isEmpty,
    loading,
    count,
    updateItem,
    removeItem,
    clear,
    applyCoupon,
    removeCoupon,
  } = useCart();
  const { settings } = useSettings();
  const toast = useToast();

  const [code, setCode] = useState('');
  const [applying, setApplying] = useState(false);
  const [busyLine, setBusyLine] = useState(null);

  useSeo({ title: 'Your bag', description: 'Review what is in your bag before checking out.', noIndex: true });

  const removed = quote?.removed ?? [];
  const meta = quote?.meta ?? {};
  const minOrder = meta.minOrderAmount ?? settings?.commerce?.minOrderAmount ?? 0;
  const belowMinimum = minOrder > 0 && (pricing?.subtotal ?? 0) < minOrder;

  const changeQty = async (line, quantity) => {
    setBusyLine(`${line.productId}-${line.variantId}`);
    try {
      await updateItem(line, quantity);
    } catch (error) {
      toast.error(error?.normalised?.message ?? 'Could not update that line');
    } finally {
      setBusyLine(null);
    }
  };

  const drop = async (line) => {
    setBusyLine(`${line.productId}-${line.variantId}`);
    try {
      await removeItem(line);
      toast.info(`${line.name} removed`);
    } catch (error) {
      toast.error(error?.normalised?.message ?? 'Could not remove that line');
    } finally {
      setBusyLine(null);
    }
  };

  const submitCoupon = async (event) => {
    event.preventDefault();
    if (!code.trim()) return;
    setApplying(true);
    try {
      await applyCoupon(code.trim());
      setCode('');
      toast.success('Coupon applied');
    } catch (error) {
      toast.error(error?.normalised?.message ?? 'That code did not work');
    } finally {
      setApplying(false);
    }
  };

  if (loading && !quote) {
    return (
      <div className="container-page py-20">
        <Spinner label="Loading your bag" className="mx-auto size-8" />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="container-page py-10">
        <h1 className="mb-6 text-2xl sm:text-3xl">Your bag</h1>
        <div className="card">
          <EmptyState
            icon="cart"
            title="Your bag is empty"
            description="Nothing in here yet. Have a look at what is on the shelf — the best sellers are a safe start."
            action={
              <Link to="/shop" className="btn-primary">
                Shop the shelf
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl">
          Your bag
          <span className="text-ink-400 ml-2 text-base font-normal">
            {count} {count === 1 ? 'jar' : 'jars'}
          </span>
        </h1>
        <button
          type="button"
          onClick={() => clear()}
          className="text-ink-500 hover:text-brand-700 cursor-pointer text-sm underline"
        >
          Empty the bag
        </button>
      </div>

      {/*
        Lines the server dropped entirely — sold out or delisted since they were added.
        Shown once, above the bag, because the customer needs to know why the total moved.
      */}
      {removed.length ? (
        <div className="border-mustard-200 bg-mustard-50 mb-4 rounded-xl border p-3">
          <p className="text-mustard-900 flex items-center gap-1.5 text-sm font-medium">
            <Icon name="alert" className="size-4 shrink-0" />
            {removed.length === 1 ? 'One item was removed' : `${removed.length} items were removed`}
          </p>
          <ul className="text-mustard-800 mt-1 list-inside list-disc text-sm">
            {removed.map((entry, index) => (
              <li key={`${entry.productId}-${index}`}>{entry.reason}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="lg:grid lg:grid-cols-[1fr_20rem] lg:items-start lg:gap-8">
        {/* --- Lines --------------------------------------------------------- */}
        <ul className="card divide-cream-200 divide-y">
          {items.map((line) => {
            const key = `${line.productId}-${line.variantId}`;
            const issue = issues?.find(
              (entry) =>
                String(entry.productId) === String(line.productId) &&
                String(entry.variantId) === String(line.variantId)
            );
            const busy = busyLine === key;

            return (
              <li key={key} className="flex gap-3 p-3 sm:gap-4 sm:p-4">
                <Link
                  to={`/product/${line.slug}`}
                  className="bg-cream-200 size-20 shrink-0 overflow-hidden rounded-xl sm:size-24"
                >
                  {line.image?.url ? (
                    <img
                      src={line.image.url}
                      alt={line.image.alt ?? line.name}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="text-cream-400 grid size-full place-items-center">
                      <Icon name="image" className="size-6" />
                    </span>
                  )}
                </Link>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-sm leading-snug font-medium sm:text-base">
                        <Link to={`/product/${line.slug}`} className="hover:text-brand-700">
                          {line.name}
                        </Link>
                      </h2>
                      <p className="text-ink-400 mt-0.5 text-xs">
                        {line.size}
                        {line.weightGrams ? ` · ${line.weightGrams} g` : ''}
                        <span className="ml-1.5 font-mono">{line.sku}</span>
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => drop(line)}
                      disabled={busy}
                      className="text-ink-400 hover:text-brand-700 -mt-1 cursor-pointer p-1 disabled:opacity-50"
                      aria-label={`Remove ${line.name} from your bag`}
                    >
                      <Icon name="trash" className="size-4" />
                    </button>
                  </div>

                  {issue ? (
                    <p className="text-mustard-800 mt-1 text-xs">{issue.reason}</p>
                  ) : line.isLowStock ? (
                    <p className="text-mustard-800 mt-1 text-xs">
                      Only {line.availableStock} left
                    </p>
                  ) : null}

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="border-cream-300 flex items-center rounded-lg border bg-white">
                      <button
                        type="button"
                        onClick={() => changeQty(line, line.quantity - 1)}
                        disabled={busy || line.quantity <= 1}
                        className="text-ink-600 hover:bg-cream-100 grid size-9 cursor-pointer place-items-center rounded-l-lg disabled:opacity-40"
                        aria-label={`One fewer ${line.name}`}
                      >
                        <Icon name="minus" className="size-3.5" />
                      </button>
                      <span className="tnum w-9 text-center text-sm font-medium">
                        {busy ? <Spinner className="mx-auto size-3.5" /> : line.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => changeQty(line, line.quantity + 1)}
                        disabled={busy || line.quantity >= Math.min(line.availableStock ?? 20, 20)}
                        className="text-ink-600 hover:bg-cream-100 grid size-9 cursor-pointer place-items-center rounded-r-lg disabled:opacity-40"
                        aria-label={`One more ${line.name}`}
                      >
                        <Icon name="plus" className="size-3.5" />
                      </button>
                    </div>

                    <div className="text-right">
                      <p className="tnum text-sm font-semibold">{formatPrice(line.lineTotal)}</p>
                      {line.listPrice > line.unitPrice ? (
                        <p className="text-ink-400 tnum text-xs">
                          <span className="line-through">{formatPrice(line.listPrice)}</span>{' '}
                          {formatPrice(line.unitPrice)} each
                        </p>
                      ) : line.quantity > 1 ? (
                        <p className="text-ink-400 tnum text-xs">
                          {formatPrice(line.unitPrice)} each
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {/* --- Summary ------------------------------------------------------- */}
        <aside className="mt-5 lg:sticky lg:top-24 lg:mt-0">
          <div className="card p-4">
            <h2 className="text-lg">Summary</h2>

            <form onSubmit={submitCoupon} className="mt-3">
              {coupon ? (
                <div className="border-leaf-200 bg-leaf-50 flex items-center gap-2 rounded-xl border p-2.5">
                  <Icon name="tag" className="text-leaf-700 size-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-leaf-900 font-mono text-sm font-medium">{coupon.code}</p>
                    {coupon.description ? (
                      <p className="text-leaf-800 truncate text-xs">{coupon.description}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCoupon()}
                    className="text-leaf-800 hover:text-leaf-900 cursor-pointer text-xs underline"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <>
                  <label htmlFor="cart-coupon" className="field-label">
                    Coupon code
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="cart-coupon"
                      value={code}
                      onChange={(event) => setCode(event.target.value.toUpperCase())}
                      className="field-input font-mono text-sm uppercase"
                      placeholder="DASHAIN10"
                      autoComplete="off"
                    />
                    <button
                      type="submit"
                      disabled={applying || !code.trim()}
                      className="btn-outline btn-sm shrink-0"
                    >
                      {applying ? <Spinner className="size-4" /> : null}
                      Apply
                    </button>
                  </div>
                  {couponError ? <p className="field-error">{couponError}</p> : null}
                </>
              )}
            </form>

            <dl className="border-cream-300 mt-4 space-y-2 border-t pt-4 text-sm">
              <Line label="Subtotal" value={formatPrice(pricing?.listSubtotal ?? pricing?.subtotal ?? 0)} />

              {pricing?.itemDiscount > 0 ? (
                <Line
                  label="Product offers"
                  value={`− ${formatPrice(pricing.itemDiscount)}`}
                  tone="leaf"
                />
              ) : null}

              {pricing?.couponDiscount > 0 ? (
                <Line
                  label={`Coupon ${coupon?.code ?? ''}`}
                  value={`− ${formatPrice(pricing.couponDiscount)}`}
                  tone="leaf"
                />
              ) : null}

              {/*
                Delivery is genuinely unknown until an address is chosen, so it says so
                rather than showing a placeholder number that changes at checkout.
              */}
              <Line
                label="Delivery"
                value={
                  quote?.delivery
                    ? quote.delivery.isFree
                      ? 'Free'
                      : formatPrice(pricing.deliveryCharge)
                    : 'Calculated at checkout'
                }
                muted={!quote?.delivery}
              />

              {pricing?.taxAmount > 0 ? (
                <Line
                  label={`${settings?.commerce?.taxLabel ?? 'Tax'} (${pricing.taxRate}%)`}
                  value={formatPrice(pricing.taxAmount)}
                />
              ) : null}

              <div className="border-cream-300 flex items-baseline justify-between border-t pt-2">
                <dt className="font-semibold">Total</dt>
                <dd className="tnum text-lg font-semibold">{formatPrice(pricing?.total ?? 0)}</dd>
              </div>

              {meta.pricesIncludeTax ? (
                <p className="text-ink-400 text-xs">
                  {settings?.commerce?.taxLabel ?? 'Tax'} included in the prices shown.
                </p>
              ) : null}
            </dl>

            {/* Free-delivery nudge, using the server's own remaining figure. */}
            {meta.amountToFreeDelivery > 0 ? (
              <div className="border-cream-300 mt-3 rounded-xl border p-3">
                <p className="text-ink-600 text-xs">
                  Add {formatPrice(meta.amountToFreeDelivery)} more for free delivery.
                </p>
                <span className="bg-cream-200 mt-1.5 block h-1.5 overflow-hidden rounded-full">
                  <span
                    className="bg-leaf-500 block h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          ((pricing?.subtotal ?? 0) /
                            Math.max(1, meta.freeDeliveryThreshold ?? 1)) *
                            100
                        )
                      )}%`,
                    }}
                  />
                </span>
              </div>
            ) : null}

            {belowMinimum ? (
              <p className="mt-3 text-sm text-red-700">
                Minimum order is {formatPrice(minOrder)}. Add {formatPrice(minOrder - (pricing?.subtotal ?? 0))} more
                to check out.
              </p>
            ) : null}

            <Link
              to="/checkout"
              aria-disabled={belowMinimum}
              onClick={(event) => {
                if (belowMinimum) event.preventDefault();
              }}
              className={`btn-primary btn-lg mt-4 w-full justify-center ${
                belowMinimum ? 'pointer-events-none opacity-50' : ''
              }`}
            >
              Checkout
              <Icon name="arrowRight" className="size-5" />
            </Link>

            <Link to="/shop" className="btn-ghost btn-sm mt-2 w-full justify-center">
              Keep shopping
            </Link>

            <p className="text-ink-400 mt-3 flex items-start gap-1.5 text-xs">
              <Icon name="info" className="mt-0.5 size-3.5 shrink-0" />
              Prices and stock are confirmed by the server at checkout, so what you see here is
              what you will be charged.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Line({ label, value, tone, muted }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={muted ? 'text-ink-400' : 'text-ink-600'}>{label}</dt>
      <dd
        className={`tnum ${
          tone === 'leaf' ? 'text-leaf-700' : muted ? 'text-ink-400 text-xs' : 'text-ink-800'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
