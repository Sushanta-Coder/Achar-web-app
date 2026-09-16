import { getSettings } from '../services/settingsService.js';
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
 * Three things stay reachable regardless:
 *   - reads, so the catalogue, policies and contact details still render
 *   - `/api/auth`, so staff can sign in *to turn it off*. Locking the door with the
 *     key inside is the classic way to turn a ten-minute maintenance window into an
 *     incident.
 *   - the gateway callbacks, so a payment already in flight when the switch was
 *     thrown still settles. Refusing those would take money without recording the
 *     order - by far the worst failure available here.
 *
 * Staff are exempt entirely: maintenance mode exists so they can work on a quiet
 * shop, not so they can be locked out of it.
 */
const ALWAYS_OPEN = [
  '/api/auth',
  '/api/payments/khalti/callback',
  '/api/payments/esewa/callback',
  '/api/webhooks',
  '/api/health',
  '/api/admin/health',
];

const isRead = (method) => method === 'GET' || method === 'HEAD' || method === 'OPTIONS';

export async function maintenanceMode(req, _res, next) {
  try {
    if (isRead(req.method)) return next();
    if (ALWAYS_OPEN.some((prefix) => req.path.startsWith(prefix))) return next();

    // Cached document - this runs on every write, so it must not be a database round
    // trip. `invalidateSettingsCache` refreshes it the moment the flag is saved.
    const settings = await getSettings();
    if (!settings.maintenanceMode) return next();

    // `optionalAuth` has not necessarily run yet on every route, so this checks the
    // role rather than assuming `req.user` is populated. `STAFF_ROLES` covers admin.
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
