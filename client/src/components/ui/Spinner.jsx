/**
 * Loading indicators.
 *
 * `<Spinner />` for inline/button use, `<PageLoader />` for a route-level Suspense
 * fallback, `<Skeleton />` for content whose shape is known.
 *
 * All three are `aria-hidden` with a separate visually hidden label - a screen reader
 * should hear "Loading" once, not read out a decorative SVG.
 */

export default function Spinner({ className = 'size-5', label }) {
  return (
    <>
      <svg
        className={`animate-spin ${className}`}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.22" strokeWidth="3" />
        <path
          d="M22 12a10 10 0 0 0-10-10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {label ? <span className="sr-only">{label}</span> : null}
    </>
  );
}

/** Route-level fallback. Sized to roughly the height of a page so the footer does not jump up. */
export function PageLoader({ label = 'Loading' }) {
  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center gap-3"
      role="status"
      aria-live="polite"
    >
      <Spinner className="text-brand-600 size-8" />
      <p className="text-ink-500 text-sm">{label}…</p>
    </div>
  );
}

export function Skeleton({ className = 'h-4 w-full' }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/** A grid of card-shaped placeholders, for the shop and admin list first paint. */
export function SkeletonCards({ count = 8, className = '' }) {
  return (
    <div
      className={`grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 ${className}`}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="card overflow-hidden">
          <Skeleton className="aspect-square w-full rounded-none" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Placeholder rows for an admin table, matching the real column count. */
export function SkeletonRows({ rows = 8, columns = 6 }) {
  return (
    <>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <tr key={rowIndex} aria-hidden="true">
          {Array.from({ length: columns }, (_, columnIndex) => (
            <td key={columnIndex} className="border-cream-200 border-b px-4 py-3.5">
              <Skeleton className={columnIndex === 0 ? 'h-4 w-28' : 'h-3.5 w-16'} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
