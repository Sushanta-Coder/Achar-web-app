import ApiError from '../utils/ApiError.js';
import env from '../config/env.js';
import { CSRF_COOKIE, timingSafeEqual } from '../utils/tokens.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit cookie CSRF protection.
 *
 * Because the session lives in an HTTP-only cookie, a cross-site form post would
 * otherwise be sent with the victim's credentials. On login we also set a
 * *readable* `ag_csrf` cookie; the client echoes it back in the `X-CSRF-Token`
 * header, which an attacker on another origin cannot do (they can cause the
 * cookie to be sent, but cannot read it to build the header).
 *
 * Payment gateway callbacks are exempt: they are server-to-server or a
 * browser redirect from the gateway domain, and are instead authenticated by
 * signature verification inside the payment providers.
 */
const EXEMPT_PREFIXES = ['/api/payments/khalti/callback', '/api/payments/esewa/callback', '/api/webhooks'];

export function csrfProtection(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (EXEMPT_PREFIXES.some((prefix) => req.path.startsWith(prefix))) return next();

  // Requests authenticated with a Bearer token are not cookie-driven, so CSRF
  // does not apply to them.
  if (req.headers.authorization?.startsWith('Bearer ')) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  // Anonymous requests carry no ambient authority worth forging.
  if (!cookieToken) return next();

  const headerToken = req.headers['x-csrf-token'] ?? req.headers['x-xsrf-token'];
  if (!headerToken || !timingSafeEqual(cookieToken, headerToken)) {
    return next(
      ApiError.forbidden('Request rejected: missing or invalid CSRF token', { code: 'CSRF_FAILED' })
    );
  }
  return next();
}

/**
 * Blocks requests whose Origin is not an allowed client origin. A second layer
 * behind CORS, which only protects browsers that honour the preflight.
 */
export function verifyOrigin(allowedOrigins) {
  const allowed = new Set(allowedOrigins);
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    if (EXEMPT_PREFIXES.some((prefix) => req.path.startsWith(prefix))) return next();
    const origin = req.headers.origin;
    // Non-browser clients (curl, server-to-server) send no Origin at all.
    if (!origin) return next();
    if (allowed.has(origin) || !env.isProd) return next();
    return next(ApiError.forbidden('Cross-origin request blocked'));
  };
}

export default csrfProtection;
