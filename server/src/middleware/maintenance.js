import { getSettings } from '../services/settingsService.js';
import { optionalAuth } from './auth.js';
import ApiError from '../utils/ApiError.js';
import { STAFF_ROLES } from '../utils/constants.js';

/**
 * Maintenance mode.
 *
 * When the flag is on, the storefront's write paths are closed and browsing is left
 * open. Turning it on mid-afternoon should stop new orders being taken - it should
 * not blank the site for everyone already reading a recipe post, and it should not
 * hide the phone number of a shop that is still answering its phone.
 *
 * Four things stay reachable regardless:
 *   - reads, so the catalogue, policies and contact details still render
 *   - `/api/auth`, so staff can sign in *to turn it off*. Locking the door with the
 *     key inside is the classic way to turn a ten-minute maintenance window into an
 *     incident.
 *   - `/api/settings/admin`, which is the switch itself. `/api/auth` alone was not
 *     enough: signing in worked and the toggle still returned 503, so the only way
 *     out was an edit to the database. The router behind this prefix requires an
 *     authenticated admin (`requireAuth, requireAdmin`), so exempting it here waives
 *     the maintenance gate and nothing else.
 *   - the gateway callbacks, so a payment already in flight when the switch was
 *     thrown still settles. Refusing those would take money without recording the
 *     order - by far the worst failure available here.
 *
 * Staff are exempt entirely: maintenance mode exists so they can work on a quiet
 * shop, not so they can be locked out of it.
 */
const ALWAYS_OPEN = [
  '/api/auth',
  '/api/settings/admin',
  '/api/payments/khalti/callback',
  '/api/payments/esewa/callback',
  '/api/webhooks',
  '/api/health',
  '/api/admin/health',
];

const isRead = (method) => method === 'GET' || method === 'HEAD' || method === 'OPTIONS';

/** `optionalAuth` as a promise, so the staff check below has a `req.user` to read. */
const attachUser = (req, res) =>
  new Promise((resolve, reject) => {
    optionalAuth(req, res, (error) => (error ? reject(error) : resolve()));
  });

export async function maintenanceMode(req, res, next) {
  try {
    if (isRead(req.method)) return next();
    if (ALWAYS_OPEN.some((prefix) => req.path.startsWith(prefix))) return next();

    // Cached document - this runs on every write, so it must not be a database round
    // trip. `invalidateSettingsCache` refreshes it the moment the flag is saved.
    const settings = await getSettings();
    if (!settings.maintenanceMode) return next();

    /**
     * The staff exemption reads `req.user`, but this middleware is mounted before the
     * routers that authenticate - so nothing had populated it and the exemption never
     * fired for anyone. Resolve the session here instead.
     *
     * Deliberately after the two checks above: the lookup is paid only on a write,
     * only while the shop is actually closed, and not at all on the read path - which
     * is why this is not simply `app.use(optionalAuth)` in app.js, where it would add
     * a user lookup to every request the shop ever serves and duplicate the one the
     * route's own `requireAuth` is about to do.
     */
    if (!req.user) await attachUser(req, res);

    // `STAFF_ROLES` covers admin.
    if (STAFF_ROLES.includes(req.user?.role)) return next();

    return next(
      ApiError.serviceUnavailable(
        'We are briefly closed for maintenance. Browsing still works - please try placing your order again shortly.'
      )
    );
  } catch (error) {
    return next(error);
  }
}

export default maintenanceMode;
