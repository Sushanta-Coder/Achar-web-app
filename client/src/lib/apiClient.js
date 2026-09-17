import axios from 'axios';

/**
 * The single Axios instance every request goes through.
 *
 * Three things live here and nowhere else:
 *
 *  1. `withCredentials`. The access, refresh and CSRF tokens are HTTP-only cookies set
 *     by the API. Nothing in this app ever reads or stores a JWT - there is no token in
 *     localStorage to steal, which is the entire point of the cookie design.
 *
 *  2. The CSRF header. The API sets a *readable* `ag_csrf` cookie at login and rotates
 *     it on refresh; we echo it back in `X-CSRF-Token` on every unsafe method. Reading
 *     it from `document.cookie` on each request rather than caching it means a rotation
 *     mid-session cannot leave us sending a stale token.
 *
 *  3. Refresh-on-401, single-flight. A 15-minute access token will expire while someone
 *     browses. The first 401 triggers one `POST /api/auth/refresh`; any other request
 *     that 401s while that is in progress waits on the same promise instead of firing
 *     its own, so a page with five parallel requests does not send five refreshes and
 *     race the rotating cookie.
 */

const baseURL = import.meta.env.VITE_API_URL || '/api';

/**
 * Exported for the handful of URLs the browser must fetch itself rather than through
 * Axios: the invoice endpoint returns printable HTML for a new tab, and the sitemap is
 * served by the API. Anything that wants JSON should go through `api` so it gets the
 * cookies, the CSRF header and the refresh-on-401 behaviour.
 */
export const API_BASE = baseURL;

export const api = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 25_000,
  headers: { Accept: 'application/json' },
});

/** Reads a non-HTTP-only cookie. Returns '' when absent rather than undefined. */
function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

const UNSAFE_METHODS = new Set(['post', 'put', 'patch', 'delete']);

api.interceptors.request.use((config) => {
  if (UNSAFE_METHODS.has((config.method || 'get').toLowerCase())) {
    const csrf = readCookie('ag_csrf');
    if (csrf) config.headers['X-CSRF-Token'] = csrf;
  }
  return config;
});

// --- Refresh coordination ----------------------------------------------------

/**
 * Endpoints that must never trigger a refresh attempt:
 * `/auth/refresh` itself (recursion), and the sign-in endpoints, whose 401 means
 * "wrong password" - retrying it would swallow the real error and show the user a
 * session-expired message for a typo.
 */
const NO_REFRESH = ['/auth/refresh', '/auth/login', '/auth/admin/login', '/auth/register'];

let refreshPromise = null;
/** Subscribers notified when a refresh fails, so contexts can clear their user. */
const sessionExpiredHandlers = new Set();

export function onSessionExpired(handler) {
  sessionExpiredHandlers.add(handler);
  return () => sessionExpiredHandlers.delete(handler);
}

function refreshSession() {
  // Single-flight: everyone who arrives while a refresh is running shares the promise.
  refreshPromise ??= api
    .post('/auth/refresh')
    .then((response) => response.data?.data?.user ?? null)
    .catch((error) => {
      sessionExpiredHandlers.forEach((handler) => handler());
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;

    if (!response) {
      // No response at all: offline, DNS failure, or the request timed out. Normalised
      // here so every caller can rely on `error.normalised`.
      error.normalised = {
        status: 0,
        message:
          error.code === 'ECONNABORTED'
            ? 'That took too long. Check your connection and try again.'
            : 'Could not reach the server. Check your internet connection.',
        errors: null,
      };
      return Promise.reject(error);
    }

    const url = config?.url ?? '';
    const canRetry =
      response.status === 401 &&
      !config?._retried &&
      !NO_REFRESH.some((path) => url.includes(path));

    if (canRetry) {
      config._retried = true;
      try {
        await refreshSession();
        return api(config);
      } catch {
        // Fall through to the normalised rejection below; the session is gone.
      }
    }

    const body = response.data ?? {};
    error.normalised = {
      status: response.status,
      // The API always sends `message`; the fallbacks cover a proxy error page.
      message: body.message || defaultMessage(response.status),
      // Zod field errors, shaped { field: 'message' } - fed straight into RHF.
      errors: body.errors ?? null,
      code: body.code ?? null,
    };
    return Promise.reject(error);
  }
);

function defaultMessage(status) {
  if (status === 401) return 'Please sign in to continue.';
  if (status === 403) return 'You do not have permission to do that.';
  if (status === 404) return 'We could not find what you were looking for.';
  if (status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (status >= 500) return 'Something went wrong on our side. Please try again.';
  return 'Something went wrong. Please try again.';
}

/**
 * Unwraps the API envelope `{ success, message, data, meta }`.
 *
 * Callers get `data` directly, with `meta` attached where a list endpoint sent
 * pagination. Every response in the API uses this envelope (see server
 * utils/ApiResponse.js), so unwrapping in one place keeps `response.data.data.orders`
 * out of every component.
 */
export async function request(config) {
  const response = await api(config);
  const body = response.data ?? {};
  const data = body.data ?? null;
  if (body.meta && data && typeof data === 'object') {
    return Object.assign(Array.isArray(data) ? [...data] : { ...data }, { meta: body.meta });
  }
  return data;
}

export const get = (url, params, config) => request({ method: 'get', url, params, ...config });
export const post = (url, data, config) => request({ method: 'post', url, data, ...config });
export const patch = (url, data, config) => request({ method: 'patch', url, data, ...config });
export const put = (url, data, config) => request({ method: 'put', url, data, ...config });
export const del = (url, config) => request({ method: 'delete', url, ...config });

/** The message + field errors to show for a caught request. */
export function apiError(error) {
  return (
    error?.normalised ?? {
      status: 0,
      message: error?.message || 'Something went wrong. Please try again.',
      errors: null,
    }
  );
}

/**
 * Applies server-side field errors to a React Hook Form instance.
 *
 * Client and server validate with the same Zod shapes, so a 422 usually means a rule
 * only the server can check (a district that is not in the chosen province, a SKU
 * already taken). Those belong on the field, not in a toast.
 *
 * Returns whether anything was applied. Treat that as "the form was told", not as "the
 * user can see it": the server names fields by *its* schema, which on a larger form can
 * include derived or nested paths with no input of their own. A caller that cannot
 * guarantee every field it might be sent is on screen should show its message anyway.
 */
export function applyFieldErrors(error, setError) {
  const { errors } = apiError(error);
  if (!errors || typeof errors !== 'object') return false;
  let applied = false;
  for (const [field, message] of Object.entries(errors)) {
    if (!field) continue;
    setError(field, { type: 'server', message: String(message) });
    applied = true;
  }
  return applied;
}

export default api;
