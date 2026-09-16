import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import env from '../config/env.js';
import { sendError } from '../utils/ApiResponse.js';

const handler = (_req, res) =>
  sendError(res, { status: 429, message: 'Too many requests. Please slow down and try again shortly.' });

const base = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
  // Rate limiting is noise in the test suite and would make it order-dependent.
  skip: () => env.isTest,
};

/** Global ceiling applied to every /api route. */
export const apiLimiter = rateLimit({
  ...base,
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
});

/**
 * Tight limit on credential endpoints (login, register, forgot/reset password).
 * Keyed by IP + submitted account so one attacker cannot lock out a whole NAT range,
 * and a single account cannot be brute-forced from rotating IPs.
 *
 * The field name differs by endpoint: login accepts an email *or* a phone number and
 * calls it `identifier`, while register and forgot-password send `email`. Reading only
 * `email` silently degraded every login to an IP-only key - which matters in Nepal,
 * where a whole city can share one carrier-grade NAT address and twelve failed logins
 * from any one of them would lock out everybody else.
 */
export const authLimiter = rateLimit({
  ...base,
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.authMax,
  keyGenerator: (req) => {
    const account = String(req.body?.identifier ?? req.body?.email ?? '')
      .toLowerCase()
      .trim();
    return `${ipKeyGenerator(req.ip)}:${account}`;
  },
});

/** Payment initiation is expensive downstream - keep it modest. */
export const paymentLimiter = rateLimit({
  ...base,
  windowMs: 5 * 60 * 1000,
  max: 20,
});

/** Order placement: generous enough for retries, tight enough to stop scripting. */
export const checkoutLimiter = rateLimit({ ...base, windowMs: 10 * 60 * 1000, max: 15 });

/** Anti-spam for public write endpoints (contact form, newsletter, reviews). */
export const publicWriteLimiter = rateLimit({ ...base, windowMs: 60 * 60 * 1000, max: 12 });

/**
 * Guest order lookup. An order number plus a phone number is a small search space,
 * so this is tighter than the read limiter - but looser than the once-an-hour public
 * write limit, because a customer refreshing their tracking page must not be locked out.
 */
export const lookupLimiter = rateLimit({ ...base, windowMs: 15 * 60 * 1000, max: 30 });

/** Search and analytics beacons are chatty but cheap. */
export const readHeavyLimiter = rateLimit({ ...base, windowMs: 60 * 1000, max: 120 });

export default apiLimiter;
