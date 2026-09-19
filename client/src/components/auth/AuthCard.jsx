import { Link } from 'react-router-dom';
import Icon from '../ui/Icon';

/**
 * The shell every auth screen sits in.
 *
 * Five pages (sign in, register, forgot, reset, verify) share one narrow centred card,
 * one logo and one "back to the shop" escape hatch. Extracting it is not about saving
 * lines - it is so a customer who bounces between sign-in and register does not see the
 * heading move two pixels, which reads as a page that is not quite finished.
 *
 * Deliberately plain: no illustration column, no marketing copy. Someone on this screen
 * is trying to get somewhere else.
 */
export default function AuthCard({ title, description, children, footer, backTo = '/' }) {
  return (
    <div className="container-page flex min-h-[70vh] items-center justify-center py-8 sm:py-14">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Link
            to={backTo}
            className="text-brand-700 inline-flex items-center gap-2 text-lg font-bold"
          >
            <span className="bg-brand-700 grid size-9 place-items-center rounded-xl text-white">
              <Icon name="flame" className="size-5" />
            </span>
            <span className="font-display">Deeva Achar</span>
          </Link>

          <h1 className="mt-5 text-2xl sm:text-3xl">{title}</h1>
          {description ? <p className="text-ink-500 mt-2 text-sm">{description}</p> : null}
        </div>

        <div className="card p-5 sm:p-6">{children}</div>

        {footer ? <div className="mt-5 text-center text-sm">{footer}</div> : null}
      </div>
    </div>
  );
}

/**
 * Form-level error. Used for everything that is not a single bad field: wrong password,
 * a rate limit, an expired link, the server being unreachable.
 */
export function FormError({ children }) {
  if (!children) return null;
  return (
    <p role="alert" className="flex gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
      <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** A password input with a reveal toggle, since every auth page needs one. */
export function PasswordField({
  id,
  label,
  registration,
  error,
  hint,
  autoComplete = 'current-password',
  shown,
  onToggle,
  autoFocus,
}) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          aria-invalid={error ? 'true' : undefined}
          className="field-input pr-11"
          {...registration}
        />
        <button
          type="button"
          onClick={onToggle}
          className="text-ink-400 hover:text-ink-700 absolute top-1/2 right-2 grid size-8 -translate-y-1/2 cursor-pointer place-items-center rounded"
          aria-label={shown ? 'Hide password' : 'Show password'}
        >
          <Icon name="eye" className="size-4" />
        </button>
      </div>
      {error ? (
        <p className="field-error">{error.message}</p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}
