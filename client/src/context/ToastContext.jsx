import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

/**
 * Toasts.
 *
 * Hand-rolled rather than a library: this is ~80 lines and a dependency would be
 * larger than the feature. The container is rendered by <ToastViewport /> in App so
 * toasts sit above every route without each page mounting its own.
 *
 * The viewport is an `aria-live` region, so a screen reader announces "Added to cart"
 * the same way a sighted visitor sees it. `assertive` for errors, `polite` otherwise -
 * an error is worth interrupting for, a confirmation is not.
 */

const ToastContext = createContext(null);

const DEFAULT_MS = 4000;
const ERROR_MS = 6500;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    ({ message, tone = 'info', title, duration }) => {
      if (!message) return null;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const ms = duration ?? (tone === 'error' ? ERROR_MS : DEFAULT_MS);

      setToasts((current) => {
        // Cap the stack. Five toasts is already more than anyone reads, and an
        // unbounded list can cover the whole viewport on a slow connection where
        // several requests fail at once.
        const next = [...current, { id, message, tone, title }];
        return next.slice(-5);
      });

      timers.current.set(
        id,
        setTimeout(() => dismiss(id), ms)
      );
      return id;
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      toasts,
      dismiss,
      toast: push,
      success: (message, options) => push({ ...options, message, tone: 'success' }),
      error: (message, options) => push({ ...options, message, tone: 'error' }),
      info: (message, options) => push({ ...options, message, tone: 'info' }),
      warning: (message, options) => push({ ...options, message, tone: 'warning' }),
    }),
    [toasts, push, dismiss]
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}

export default ToastContext;
