import { useCallback, useEffect, useRef, useState } from 'react';
import { get, apiError } from '../lib/apiClient';

/**
 * Data fetching.
 *
 * Deliberately not TanStack Query. The spec asked to avoid large libraries where a
 * small amount of code suffices, and what this app actually needs from a query library
 * is: loading state, error state, request cancellation on unmount, and a manual
 * refetch. That is the hook below. There is no cross-component cache, which is the
 * real trade-off - two components asking for the same URL make two requests. The pages
 * here are structured so that does not happen (the parent fetches, children take props).
 */

/**
 * GET a URL and track the request lifecycle.
 *
 *   const { data, loading, error, refetch } = useFetch('/products', { params, skip });
 *
 * `params` is compared by serialised value, so passing a fresh object literal every
 * render does not loop. `skip` defers the request - used for dependent fetches and for
 * anything that must wait on auth being ready.
 */
export function useFetch(url, { params, skip = false, deps = [] } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(!skip);
  const [reloadKey, setReloadKey] = useState(0);

  const paramsKey = JSON.stringify(params ?? null);
  const depsKey = JSON.stringify(deps);

  useEffect(() => {
    if (skip || !url) {
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const result = await get(url, JSON.parse(paramsKey) ?? undefined, {
          signal: controller.signal,
        });
        if (!cancelled) setData(result);
      } catch (caught) {
        // An aborted request is not a failure - it means the component unmounted or the
        // params changed. Surfacing it would flash an error during normal navigation.
        if (cancelled || controller.signal.aborted) return;
        setError(apiError(caught));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url, paramsKey, skip, reloadKey, depsKey]);

  const refetch = useCallback(() => setReloadKey((key) => key + 1), []);

  /** Local optimistic patch - used after a mutation so the list updates immediately. */
  const mutate = useCallback((updater) => {
    setData((current) => (typeof updater === 'function' ? updater(current) : updater));
  }, []);

  return { data, error, loading, refetch, mutate, setData };
}

/**
 * Wraps a one-off write (submit, delete, status change) so components do not each
 * re-implement pending/error handling.
 *
 *   const { run, pending } = useMutation((body) => post('/orders', body));
 *   await run(values);
 *
 * Errors are re-thrown after being recorded, so the caller can still branch on them
 * (apply field errors, keep the modal open) rather than having them silently swallowed.
 */
export function useMutation(fn, { onSuccess, onError } = {}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args) => {
      setPending(true);
      setError(null);
      try {
        const result = await fn(...args);
        if (mounted.current) setPending(false);
        onSuccess?.(result);
        return result;
      } catch (caught) {
        const normalised = apiError(caught);
        if (mounted.current) {
          setError(normalised);
          setPending(false);
        }
        onError?.(normalised, caught);
        throw caught;
      }
    },
    [fn, onSuccess, onError]
  );

  return { run, pending, error, reset: () => setError(null) };
}

/**
 * Debounces a value. Used for the search box and the admin list filters, so typing
 * does not fire a request per keystroke.
 */
export function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export default useFetch;
