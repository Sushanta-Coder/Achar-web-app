import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/ApiResponse.js';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  setAuthCookies,
  clearAuthCookies,
  randomToken,
  hashToken,
} from '../utils/tokens.js';
import { mergeGuestCart } from '../services/cartService.js';
import { notifyWelcome, notifyPasswordReset } from '../services/notificationService.js';
import { escapeRegex } from '../utils/pagination.js';
import { NEPAL_MOBILE_REGEX, normalizePhone } from '../utils/nepal.js';
import { ROLES } from '../utils/constants.js';
import logger from '../config/logger.js';

/**
 * Authentication.
 *
 * Tokens are returned in HTTP-only cookies, never in the JSON body, so a script
 * injected into the page cannot read them. The response carries only the user
 * profile and the CSRF token the client must echo back on writes.
 *
 * Password reset deliberately answers identically whether or not the address is
 * registered - a differing response is an account-enumeration oracle.
 */

const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

/** The only shape of a user that ever leaves the API. */
function publicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    role: user.role,
    emailVerified: user.emailVerified,
    marketingOptIn: user.marketingOptIn,
    locale: user.locale,
    orderCount: user.orderCount ?? 0,
    totalSpent: user.totalSpent ?? 0,
    addresses: (user.addresses ?? []).map((address) => ({
      ...(address.toObject ? address.toObject({ virtuals: true }) : address),
      _id: String(address._id),
    })),
    createdAt: user.createdAt,
  };
}

/** Mints a fresh token pair and writes all three cookies. */
function issueSession(res, user) {
  const payload = { sub: String(user._id), role: user.role, tv: user.tokenVersion ?? 0 };
  const csrfToken = setAuthCookies(res, {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken({ sub: payload.sub, tv: payload.tv }),
  });
  return csrfToken;
}

export const register = asyncHandler(async (req, res) => {
  const { name, email, phone, password, marketingOptIn, cart } = req.body;

  if (await User.exists({ email })) {
    throw ApiError.conflict('An account with that email already exists');
  }
  if (phone && (await User.exists({ phone }))) {
    throw ApiError.conflict('An account with that phone number already exists');
  }

  const verificationToken = randomToken(24);
  const user = await User.create({
    name,
    email,
    phone: phone || undefined,
    password,
    marketingOptIn,
    role: ROLES.CUSTOMER,
    emailVerificationToken: hashToken(verificationToken),
    emailVerificationExpires: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
  });

  if (cart?.length) await mergeGuestCart({ user, items: cart });

  // Email delivery must never fail a signup.
  notifyWelcome(user).catch((error) => logger.warn(`Welcome email failed: ${error.message}`));

  const csrfToken = issueSession(res, user);
  return sendCreated(res, {
    message: 'Welcome to Achar Ghar',
    data: { user: publicUser(user), csrfToken },
  });
});

export const login = asyncHandler(async (req, res) => {
  const { identifier, password, cart } = req.body;

  // One field, two possible meanings: an email or a Nepali mobile number.
  const digits = normalizePhone(identifier);
  const query = NEPAL_MOBILE_REGEX.test(digits)
    ? { phone: digits }
    : { email: String(identifier).trim().toLowerCase() };

  const user = await User.findOne(query).select('+password +tokenVersion');

  // Same message for "no such user" and "wrong password", so neither confirms the other.
  const invalid = ApiError.unauthorized('Email/phone or password is incorrect');
  if (!user) throw invalid;
  if (!(await user.comparePassword(password))) throw invalid;
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

  if (cart?.length) await mergeGuestCart({ user, items: cart });

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  const csrfToken = issueSession(res, user);
  return sendSuccess(res, {
    message: `Welcome back, ${user.name.split(' ')[0]}`,
    data: { user: publicUser(user), csrfToken },
  });
});

/**
 * Admin sign-in is a separate endpoint with its own rate limit, and refuses
 * customer accounts outright rather than letting them in and hiding the UI.
 */
export const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password +tokenVersion');

  const invalid = ApiError.unauthorized('Email or password is incorrect');
  if (!user) throw invalid;
  if (!(await user.comparePassword(password))) throw invalid;
  if (!user.isStaff()) throw ApiError.forbidden('This account does not have admin access');
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });
  logger.info(`Admin sign-in: ${user.email}`);

  const csrfToken = issueSession(res, user);
  return sendSuccess(res, {
    message: 'Signed in',
    data: { user: publicUser(user), csrfToken },
  });
});

export const logout = asyncHandler(async (_req, res) => {
  clearAuthCookies(res);
  return sendSuccess(res, { message: 'Signed out' });
});

/**
 * Rotates the access token from the refresh cookie. `tokenVersion` is re-checked
 * here as well as in the auth middleware, so "log out everywhere" also kills the
 * ability to mint new access tokens.
 */
export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw ApiError.unauthorized('Your session has expired, please sign in again');

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    clearAuthCookies(res);
    throw ApiError.unauthorized('Your session has expired, please sign in again');
  }

  const user = await User.findById(payload.sub).select('+tokenVersion');
  if (!user || !user.isActive || (payload.tv ?? 0) !== (user.tokenVersion ?? 0)) {
    clearAuthCookies(res);
    throw ApiError.unauthorized('Your session has expired, please sign in again');
  }

  const csrfToken = issueSession(res, user);
  return sendSuccess(res, { message: 'Session refreshed', data: { user: publicUser(user), csrfToken } });
});

export const me = asyncHandler(async (req, res) =>
  sendSuccess(res, { data: { user: publicUser(req.user) } })
);

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email }).select('+passwordResetToken +passwordResetExpires');

  // Always the same response, whether or not the address exists.
  const message = 'If that email is registered, a reset link is on its way';

  if (!user || !user.isActive) return sendSuccess(res, { message });

  const resetToken = randomToken(32);
  user.passwordResetToken = hashToken(resetToken);
  user.passwordResetExpires = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  await user.save({ validateBeforeSave: false });

  try {
    await notifyPasswordReset(user, resetToken);
  } catch (error) {
    logger.error(`Password reset email failed for ${user.email}: ${error.message}`);
  }

  return sendSuccess(res, { message });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { email, token, password } = req.body;

  const user = await User.findOne({
    email,
    passwordResetToken: hashToken(token),
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordResetToken +passwordResetExpires +tokenVersion +password');

  if (!user) throw ApiError.badRequest('That reset link is invalid or has expired');

  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  // Invalidate every existing session: a reset is often a response to a compromise.
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();

  clearAuthCookies(res);
  return sendSuccess(res, { message: 'Your password has been reset - please sign in' });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, password } = req.body;
  const user = await User.findById(req.user._id).select('+password +tokenVersion');

  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.badRequest('Your current password is incorrect', {
      details: { currentPassword: 'Your current password is incorrect' },
    });
  }
  if (await user.comparePassword(password)) {
    throw ApiError.badRequest('Choose a password different from your current one', {
      details: { password: 'Choose a password different from your current one' },
    });
  }

  user.password = password;
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();

  // The caller keeps their session; every other device is signed out.
  const csrfToken = issueSession(res, user);
  return sendSuccess(res, {
    message: 'Password updated - other devices have been signed out',
    data: { csrfToken },
  });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const { email, token } = req.body;
  const user = await User.findOne({
    email,
    emailVerificationToken: hashToken(token),
    emailVerificationExpires: { $gt: new Date() },
  }).select('+emailVerificationToken +emailVerificationExpires');

  if (!user) throw ApiError.badRequest('That verification link is invalid or has expired');

  user.emailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save({ validateBeforeSave: false });

  return sendSuccess(res, { message: 'Email verified' });
});

/** Signs the user out of every device by bumping tokenVersion. */
export const logoutEverywhere = asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
  clearAuthCookies(res);
  return sendSuccess(res, { message: 'Signed out on all devices' });
});

/**
 * Availability check for the registration form. Rate-limited and returns only a
 * boolean, but it is still an enumeration surface, so it is a deliberate trade:
 * a much better signup experience for a fact an attacker can already learn by
 * attempting to register.
 */
export const checkAvailability = asyncHandler(async (req, res) => {
  const { email, phone } = req.query;
  const data = {};
  if (email) {
    data.email = !(await User.exists({ email: String(email).trim().toLowerCase() }));
  }
  if (phone) {
    const digits = normalizePhone(phone);
    data.phone = NEPAL_MOBILE_REGEX.test(digits) ? !(await User.exists({ phone: digits })) : false;
  }
  return sendSuccess(res, { data });
});

/** Exported for the admin customer search, which matches on the same fields. */
export const buildUserSearch = (term) => {
  const pattern = new RegExp(escapeRegex(String(term).trim()), 'i');
  return { $or: [{ name: pattern }, { email: pattern }, { phone: pattern }] };
};

export { publicUser, ACCESS_COOKIE };

export default {
  register,
  login,
  adminLogin,
  logout,
  refresh,
  me,
  forgotPassword,
  resetPassword,
  changePassword,
  verifyEmail,
  logoutEverywhere,
  checkAvailability,
};
