/**
 * Status pills for orders, payments and stock.
 *
 * The label maps mirror `server/src/utils/constants.js`. They are duplicated here
 * rather than fetched because they are display strings on a fixed enum - a request to
 * render a badge would be absurd - but the *transitions* are never duplicated: the
 * admin status dropdown is driven by `allowedTransitions` from the API, so the one
 * thing that must not drift (which changes are legal) has a single source of truth.
 */

export const ORDER_STATUS_LABELS = {
  pending: 'Pending',
  payment_pending: 'Awaiting payment',
  paid: 'Paid',
  processing: 'Processing',
  packed: 'Packed',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

/**
 * Colour carries meaning here, so each tone is also distinguishable by its label -
 * never colour alone. Amber for "waiting on someone", blue for "we are working on it",
 * green for done, red for failed.
 */
const ORDER_TONES = {
  pending: 'bg-mustard-100 text-mustard-900 border-mustard-200',
  payment_pending: 'bg-mustard-100 text-mustard-900 border-mustard-200',
  paid: 'bg-leaf-100 text-leaf-800 border-leaf-200',
  processing: 'bg-sky-100 text-sky-900 border-sky-200',
  packed: 'bg-sky-100 text-sky-900 border-sky-200',
  shipped: 'bg-indigo-100 text-indigo-900 border-indigo-200',
  out_for_delivery: 'bg-indigo-100 text-indigo-900 border-indigo-200',
  delivered: 'bg-leaf-100 text-leaf-800 border-leaf-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
  refunded: 'bg-cream-200 text-ink-700 border-cream-400',
};

export const PAYMENT_STATUS_LABELS = {
  pending: 'Unpaid',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
  partially_refunded: 'Part refunded',
};

const PAYMENT_TONES = {
  pending: 'bg-mustard-100 text-mustard-900 border-mustard-200',
  paid: 'bg-leaf-100 text-leaf-800 border-leaf-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
  refunded: 'bg-cream-200 text-ink-700 border-cream-400',
  partially_refunded: 'bg-cream-200 text-ink-700 border-cream-400',
};

export const PAYMENT_METHOD_LABELS = {
  cod: 'Cash on delivery',
  khalti: 'Khalti',
  esewa: 'eSewa',
  bank_transfer: 'Bank transfer',
};

export default function StatusBadge({ status, className = '' }) {
  const label = ORDER_STATUS_LABELS[status] ?? status ?? 'Unknown';
  const tone = ORDER_TONES[status] ?? 'bg-cream-200 text-ink-700 border-cream-400';
  return <span className={`badge border ${tone} ${className}`}>{label}</span>;
}

export function PaymentBadge({ status, method, className = '' }) {
  const label = PAYMENT_STATUS_LABELS[status] ?? status ?? 'Unknown';
  const tone = PAYMENT_TONES[status] ?? 'bg-cream-200 text-ink-700 border-cream-400';
  return (
    <span className={`badge border ${tone} ${className}`}>
      {label}
      {method ? <span className="opacity-65">· {PAYMENT_METHOD_LABELS[method] ?? method}</span> : null}
    </span>
  );
}

/**
 * Stock badge. The thresholds come from the variant itself (`lowStockThreshold`), which
 * the admin sets per variant - a 1kg jar that sells three a week needs a different
 * warning point than a 250g one that sells thirty.
 */
export function StockBadge({ available = 0, threshold = 5, className = '' }) {
  if (available <= 0) {
    return <span className={`badge border border-red-200 bg-red-100 text-red-800 ${className}`}>Out of stock</span>;
  }
  if (available <= threshold) {
    return (
      <span className={`badge border-mustard-200 bg-mustard-100 text-mustard-900 border ${className}`}>
        Low · {available} left
      </span>
    );
  }
  return (
    <span className={`badge border-leaf-200 bg-leaf-100 text-leaf-800 border ${className}`}>
      In stock · {available}
    </span>
  );
}
