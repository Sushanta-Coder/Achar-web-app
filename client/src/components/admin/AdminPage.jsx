import { Link } from 'react-router-dom';
import Icon from '../ui/Icon';
import { formatNumber } from '../../lib/format';

/**
 * Admin page furniture: header, stat tiles, pagination, filter bar, confirm dialog.
 *
 * Collected in one file because they are only meaningful together - every admin screen
 * uses the header and most use two or three of the rest, and splitting them into five
 * files would mean five imports per page for no benefit.
 */

export function PageHeader({ title, description, breadcrumb, actions, className = '' }) {
  return (
    <div className={`mb-6 ${className}`}>
      {breadcrumb?.length ? (
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="text-ink-400 flex flex-wrap items-center gap-1.5 text-xs">
            {breadcrumb.map((crumb, index) => (
              <li key={crumb.label} className="flex items-center gap-1.5">
                {index > 0 ? <Icon name="chevronRight" className="size-3" /> : null}
                {crumb.to ? (
                  <Link to={crumb.to} className="hover:text-brand-700 transition">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-ink-600 font-medium">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
          {description ? <p className="text-ink-500 mt-1 text-sm">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

/**
 * A metric tile. `delta` is a percentage change against the previous period; positive is
 * not automatically good, so `invertDelta` exists for metrics like cancellations where a
 * rise is bad.
 */
export function StatTile({ label, value, sub, icon, delta, invertDelta = false, to, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    leaf: 'bg-leaf-50 text-leaf-700',
    mustard: 'bg-mustard-50 text-mustard-700',
    ink: 'bg-cream-200 text-ink-600',
    red: 'bg-red-50 text-red-700',
  };

  const good = delta == null ? null : invertDelta ? delta < 0 : delta > 0;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-ink-500 text-xs font-semibold tracking-wide uppercase">{label}</p>
        {icon ? (
          <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${tones[tone]}`}>
            <Icon name={icon} className="size-4" />
          </span>
        ) : null}
      </div>

      <p className="text-ink-900 tnum mt-2 text-2xl font-bold">{value}</p>

      <div className="mt-1 flex items-center gap-2">
        {sub ? <p className="text-ink-400 text-xs">{sub}</p> : null}
        {delta != null && Number.isFinite(delta) ? (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
              good ? 'text-leaf-700' : 'text-red-700'
            }`}
          >
            {delta > 0 ? '↑' : delta < 0 ? '↓' : '·'} {Math.abs(delta).toFixed(1)}%
          </span>
        ) : null}
      </div>
    </>
  );

  if (to) {
    return (
      <Link to={to} className="card hover:shadow-[--shadow-card-hover] block p-4 transition">
        {body}
      </Link>
    );
  }
  return <div className="card p-4">{body}</div>;
}

/**
 * Pagination. Renders nothing for a single page - a pager under a five-row table is
 * noise. Windows the page numbers so 40 pages does not produce 40 buttons.
 */
export function Pagination({ meta, onPage, className = '' }) {
  if (!meta || meta.totalPages <= 1) return null;

  const { page, totalPages, total, limit } = meta;
  const window = 2;
  const pages = [];

  for (let index = 1; index <= totalPages; index += 1) {
    const nearCurrent = Math.abs(index - page) <= window;
    if (index === 1 || index === totalPages || nearCurrent) pages.push(index);
    else if (pages.at(-1) !== '…') pages.push('…');
  }

  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <p className="text-ink-500 text-sm">
        Showing <span className="text-ink-800 font-medium">{formatNumber(first)}</span>–
        <span className="text-ink-800 font-medium">{formatNumber(last)}</span> of{' '}
        <span className="text-ink-800 font-medium">{formatNumber(total)}</span>
      </p>

      <nav className="flex items-center gap-1" aria-label="Pagination">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={!meta.hasPrevPage}
          className="btn-outline btn-sm size-9 px-0"
          aria-label="Previous page"
        >
          <Icon name="chevronLeft" className="size-4" />
        </button>

        {pages.map((entry, index) =>
          entry === '…' ? (
            <span key={`gap-${index}`} className="text-ink-400 px-1 text-sm">
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              onClick={() => onPage(entry)}
              aria-current={entry === page ? 'page' : undefined}
              className={
                entry === page
                  ? 'btn btn-sm bg-brand-700 min-w-9 text-white'
                  : 'btn-outline btn-sm min-w-9'
              }
            >
              {entry}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={!meta.hasNextPage}
          className="btn-outline btn-sm size-9 px-0"
          aria-label="Next page"
        >
          <Icon name="chevronRight" className="size-4" />
        </button>
      </nav>
    </div>
  );
}

/** Status tab strip, driven by a counts map from the API. */
export function TabBar({ tabs, active, onChange, counts = {} }) {
  return (
    <div className="no-scrollbar -mx-1 mb-4 flex gap-1 overflow-x-auto px-1">
      {tabs.map((tab) => {
        const isActive = active === tab.value;
        const count = counts[tab.value];
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            aria-current={isActive ? 'true' : undefined}
            className={`btn btn-sm shrink-0 gap-1.5 ${
              isActive ? 'bg-ink-800 text-white' : 'text-ink-600 hover:bg-cream-200 bg-white'
            }`}
          >
            {tab.label}
            {count != null ? (
              <span
                className={`tnum rounded px-1.5 text-[0.6875rem] font-bold ${
                  isActive ? 'bg-white/20' : 'bg-cream-200 text-ink-500'
                }`}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Search + filters row. Children are the filter controls. */
export function FilterBar({ value, onChange, placeholder = 'Search…', children, onReset }) {
  return (
    <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
      <div className="relative min-w-48 flex-1">
        <Icon
          name="search"
          className="text-ink-400 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <label className="sr-only" htmlFor="admin-filter-search">
          {placeholder}
        </label>
        <input
          id="admin-filter-search"
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="field-input min-h-10 pl-9 text-sm"
        />
      </div>

      {children}

      {onReset ? (
        <button type="button" onClick={onReset} className="btn-ghost btn-sm">
          Reset
        </button>
      ) : null}
    </div>
  );
}

/**
 * Modal. Closes on backdrop click and Escape, restores focus to whatever opened it, and
 * moves focus inside on open so a keyboard user is not left behind on the page.
 */
export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-80 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="animate-fade-in bg-ink-900/50 absolute inset-0"
        onClick={onClose}
        aria-label="Close"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`animate-fade-up relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-[--shadow-pop] sm:rounded-2xl ${widths[size]}`}
      >
        <div className="border-cream-300 flex items-center justify-between gap-3 border-b px-5 py-3.5">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost size-9 rounded-lg px-0"
            aria-label="Close dialog"
          >
            <Icon name="close" className="size-4.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer ? (
          <div className="border-cream-300 bg-cream-50 flex items-center justify-end gap-2 border-t px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Two-line label/value row, used all over the order and customer detail panels. */
export function DetailRow({ label, children, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-4 py-1.5 ${className}`}>
      <dt className="text-ink-500 shrink-0 text-sm">{label}</dt>
      <dd className="text-ink-800 min-w-0 text-right text-sm font-medium">{children}</dd>
    </div>
  );
}

/** A titled panel. The admin equivalent of a card with a header. */
export function Panel({ title, actions, children, className = '', bodyClassName = 'p-4' }) {
  return (
    <section className={`card overflow-hidden ${className}`}>
      {title ? (
        <header className="border-cream-300 bg-cream-50 flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions}
        </header>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
