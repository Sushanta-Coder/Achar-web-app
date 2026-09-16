import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { ACCESS_COOKIE, verifyAccessToken } from '../utils/tokens.js';
import { ROLES } from '../utils/constants.js';

/**
 * Reads the access token from the HTTP-only cookie, falling back to an
 * `Authorization: Bearer` header so that non-browser clients (mobile app, API
 * tests, monitoring) can authenticate too.
 */
function extractToken(req) {
  const fromCookie = req.cookies?.[ACCESS_COOKIE];
  if (fromCookie) return fromCookie;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

async function resolveUser(token) {
  const payload = verifyAccessToken(token);
  const user = await User.findById(payload.sub).select('+tokenVersion +passwordChangedAt');
  if (!user) throw ApiError.unauthorized('Your session is no longer valid');
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');
  // A password change or "log out everywhere" bumps tokenVersion, instantly
  // invalidating every token minted before it.
  if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) {
    throw ApiError.unauthorized('Your session has expired, please sign in again');
  }
  return user;
}

/** Hard requirement: rejects the request when there is no valid session. */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Please sign in to continue');
  try {
    req.user = await resolveUser(token);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.unauthorized('Your session has expired, please sign in again');
  }
  return next();
});

/**
 * Soft authentication: attaches `req.user` when a valid session exists but never
 * blocks the request. Used by guest-capable endpoints (cart, checkout, tracking).
 */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next();
  try {
    req.user = await resolveUser(token);
  } catch {
    // Ignored on purpose - the caller continues as a guest.
  }
  return next();
});

/** Role gate. `authorize(ROLES.ADMIN)` or `authorize(ROLES.ADMIN, ROLES.STAFF)`. */
export function authorize(...roles) {
  const allowed = roles.length ? roles : [ROLES.ADMIN];
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized('Please sign in to continue'));
    if (!allowed.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have permission to perform this action'));
    }
    return next();
  };
}

/** Admin or staff. Staff may fulfil orders but not change settings or users. */
export const requireStaff = authorize(ROLES.ADMIN, ROLES.STAFF);
export const requireAdmin = authorize(ROLES.ADMIN);

export default requireAuth;
