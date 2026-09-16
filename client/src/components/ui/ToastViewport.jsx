import { useToast } from '../../context/ToastContext';

/**
 * The toast stack. Rendered once, in App, above the router.
 *
 * Bottom on mobile (thumb reach, and it does not cover the header cart) and
 * top-right on desktop, where the eye is already after a click in the header.
 */

const TONES = {
  success: {
    wrap: 'border-leaf-300 bg-leaf-50 text-leaf-900',
    icon: 'text-leaf-600',
    path: 'M20 6 9 17l-5-5',
  },
  error: {
    wrap: 'border-red-300 bg-red-50 text-red-900',
    icon: 'text-red-600',
    path: 'M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  },
  warning: {
    wrap: 'border-mustard-300 bg-mustard-50 text-mustard-900',
    icon: 'text-mustard-600',
    path: 'M12 9v4m0 4h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
  },
  info: {
    wrap: 'border-cream-400 bg-white text-ink-800',
    icon: 'text-brand-600',
    path: 'M12 16v-4m0-4h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
  },
};

export default function ToastViewport() {
  const { toasts, dismiss } = useToast();

  return (
    <>
      {/*
        Two regions rather than one: `assertive` interrupts whatever a screen reader is
        reading, which is right for an error and wrong for "Added to cart". Both are
        always mounted - a live region added to the DOM at the same time as its content
        is often not announced at all.
      */}
      <div
        aria-live="assertive"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-90 flex flex-col items-center gap-2 px-4 pb-4 sm:inset-x-auto sm:top-0 sm:right-0 sm:bottom-auto sm:items-end sm:p-4"
      >
        {toasts
          .filter((toast) => toast.tone === 'error')
          .map((toast) => (
            <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
      </div>

      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-90 flex flex-col items-center gap-2 px-4 pb-4 sm:inset-x-auto sm:top-0 sm:right-0 sm:bottom-auto sm:items-end sm:p-4"
      >
        {toasts
          .filter((toast) => toast.tone !== 'error')
          .map((toast) => (
            <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
      </div>
    </>
  );
}

function Toast({ toast, onDismiss }) {
  const tone = TONES[toast.tone] ?? TONES.info;

  return (
    <div
      className={`animate-fade-up pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border px-4 py-3 shadow-[--shadow-pop] ${tone.wrap}`}
    >
      <svg
        className={`mt-0.5 size-5 shrink-0 ${tone.icon}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={tone.path} />
      </svg>

      <div className="min-w-0 flex-1 text-sm">
        {toast.title ? <p className="font-semibold">{toast.title}</p> : null}
        <p className={toast.title ? 'mt-0.5 opacity-90' : 'font-medium'}>{toast.message}</p>
      </div>

      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="-m-1 cursor-pointer rounded p-1 opacity-50 transition hover:opacity-100"
        aria-label="Dismiss notification"
      >
        <svg
          className="size-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
