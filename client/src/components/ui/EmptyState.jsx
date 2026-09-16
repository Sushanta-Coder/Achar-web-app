import { Link } from 'react-router-dom';
import Icon from './Icon';

/**
 * The "nothing here" panel, used by every list in the app - empty cart, no orders, no
 * search results, a filter that matched nothing.
 *
 * It always offers a way out. An empty state with no action is a dead end, and on a shop
 * that means a visitor who leaves.
 */
export default function EmptyState({
  icon = 'box',
  title,
  description,
  action,
  actionTo,
  onAction,
  secondary,
  className = '',
}) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-14 text-center ${className}`}>
      <span className="bg-cream-200 text-ink-400 mb-4 grid size-14 place-items-center rounded-full">
        <Icon name={icon} className="size-7" />
      </span>

      <h2 className="text-ink-900 text-lg font-semibold">{title}</h2>
      {description ? <p className="text-ink-500 mt-1.5 max-w-md text-sm">{description}</p> : null}

      {action ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {/*
            `action` is usually a label and the component builds the control. Passing a
            ready-made element is also allowed, and then it is rendered as-is - wrapping
            it would nest a button inside a button, which no browser handles predictably.
          */}
          {typeof action !== 'string' ? (
            action
          ) : actionTo ? (
            <Link to={actionTo} className="btn-primary">
              {action}
            </Link>
          ) : (
            <button type="button" onClick={onAction} className="btn-primary">
              {action}
            </button>
          )}
          {secondary}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Error panel. Separate from EmptyState because the affordance is different: an empty
 * list needs a way forward, a failed request needs a retry.
 */
export function ErrorState({ error, onRetry, className = '' }) {
  const message = error?.message ?? 'Something went wrong.';

  return (
    <div
      className={`flex flex-col items-center justify-center px-6 py-14 text-center ${className}`}
      role="alert"
    >
      <span className="mb-4 grid size-14 place-items-center rounded-full bg-red-100 text-red-600">
        <Icon name="alert" className="size-7" />
      </span>
      <h2 className="text-ink-900 text-lg font-semibold">We hit a problem</h2>
      <p className="text-ink-500 mt-1.5 max-w-md text-sm">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="btn-outline mt-5">
          <Icon name="refresh" className="size-4" />
          Try again
        </button>
      ) : null}
    </div>
  );
}
