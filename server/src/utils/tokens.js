import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';

export const ACCESS_COOKIE = 'ag_access';
export const REFRESH_COOKIE = 'ag_refresh';
export const CSRF_COOKIE = 'ag_csrf';

export function signAccessToken(payload) {
  return jwt.sign(payload, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
    issuer: 'achar-ghar',
  });
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn,
    issuer: 'achar-ghar',
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.secret, { issuer: 'achar-ghar' });
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwt.refreshSecret, { issuer: 'achar-ghar' });
}

/** Random, URL-safe token for password resets and email verification. */
export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Reset tokens are stored hashed, so a leaked database dump cannot be used to
 * take over accounts. SHA-256 is appropriate here (high-entropy input, so the
 * slow-hash requirement that applies to passwords does not apply).
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const parseDuration = (value) => {
  const match = /^(\d+)([smhd])$/.exec(String(value).trim());
  if (!match) return 15 * 60 * 1000;
  const amount = Number(match[1]);
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
  return amount * unit;
};

export const accessCookieMaxAge = () => parseDuration(env.jwt.expiresIn);
export const refreshCookieMaxAge = () => parseDuration(env.jwt.refreshExpiresIn);

function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: env.cookie.secure,
    sameSite: env.cookie.sameSite,
    domain: env.cookie.domain,
    path: '/',
  };
}

/**
 * JWTs live in HTTP-only cookies so that XSS cannot read them. The CSRF cookie is
 * intentionally readable by JS - it is the "double submit" half of the pair and
 * carries no authority on its own.
 */
export function setAuthCookies(res, { accessToken, refreshToken }) {
  res.cookie(ACCESS_COOKIE, accessToken, { ...baseCookieOptions(), maxAge: accessCookieMaxAge() });
  if (refreshToken) {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...baseCookieOptions(),
      maxAge: refreshCookieMaxAge(),
      path: '/api/auth',
    });
  }
  const csrfToken = randomToken(16);
  res.cookie(CSRF_COOKIE, csrfToken, {
    ...baseCookieOptions(),
    httpOnly: false,
    maxAge: refreshCookieMaxAge(),
  });
  return csrfToken;
}

export function clearAuthCookies(res) {
  const options = baseCookieOptions();
  res.clearCookie(ACCESS_COOKIE, options);
  res.clearCookie(REFRESH_COOKIE, { ...options, path: '/api/auth' });
  res.clearCookie(CSRF_COOKIE, { ...options, httpOnly: false });
}

export default {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  setAuthCookies,
  clearAuthCookies,
  randomToken,
  hashToken,
  timingSafeEqual,
};
