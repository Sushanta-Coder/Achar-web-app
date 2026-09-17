import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load server/.env regardless of the cwd the process was started from.
// `override: true` so values in .env win over anything the shell injected
// (e.g. PORT=5173 set by the dev preview harness for the Vite process).
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

const bool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const int = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const list = (value, fallback = []) =>
  value
    ? String(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : fallback;

/**
 * Applies a convenience default only outside production.
 *
 * The payment sandbox credentials below are public, published values. Defaulting to
 * them in development is what lets `npm run dev` reach a working checkout with no
 * setup. Defaulting to them in *production* would mean an unset variable silently
 * arms the sandbox - so there they resolve to empty, which reads as "this gateway is
 * not configured" and switches the method off. A shop can then go live on COD alone,
 * which `assertProductionEnv` would otherwise refuse to boot at all.
 *
 * Anyone who actually pastes a sandbox value into production is still caught by the
 * explicit checks in `assertProductionEnv()` - this only changes the unset case.
 */
const devOnly = (value, sandboxDefault) => {
  if (value) return value;
  return process.env.NODE_ENV === 'production' ? '' : sandboxDefault;
};

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  get isProd() {
    return this.nodeEnv === 'production';
  },
  get isTest() {
    return this.nodeEnv === 'test';
  },
  port: int(process.env.PORT, 5000),

  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/achar-ghar',

  clientUrl: (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, ''),
  serverUrl: (process.env.SERVER_URL || `http://localhost:${int(process.env.PORT, 5000)}`).replace(
    /\/$/,
    ''
  ),
  corsOrigins: list(process.env.CORS_ORIGINS),

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-only-insecure-access-secret-change-me',
    refreshSecret:
      process.env.JWT_REFRESH_SECRET || 'dev-only-insecure-refresh-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  cookie: {
    // Cross-site cookies (Vercel frontend -> Render backend) require SameSite=None + Secure.
    sameSite: process.env.COOKIE_SAMESITE || (bool(process.env.COOKIE_CROSS_SITE) ? 'none' : 'lax'),
    secure: bool(process.env.COOKIE_SECURE, process.env.NODE_ENV === 'production'),
    domain: process.env.COOKIE_DOMAIN || undefined,
  },

  rateLimit: {
    windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: int(process.env.RATE_LIMIT_MAX, 300),
    authMax: int(process.env.RATE_LIMIT_AUTH_MAX, 12),
  },

  khalti: {
    // Sandbox: https://dev.khalti.com/api/v2 | Live: https://khalti.com/api/v2
    baseUrl: (process.env.KHALTI_BASE_URL || 'https://dev.khalti.com/api/v2').replace(/\/$/, ''),
    secretKey: process.env.KHALTI_SECRET_KEY || '',
    publicKey: process.env.KHALTI_PUBLIC_KEY || '',
  },

  esewa: {
    // Sandbox: https://rc-epay.esewa.com.np | Live: https://epay.esewa.com.np
    baseUrl: devOnly(process.env.ESEWA_BASE_URL, 'https://rc-epay.esewa.com.np').replace(/\/$/, ''),
    merchantId: devOnly(process.env.ESEWA_MERCHANT_ID, 'EPAYTEST'),
    secretKey: devOnly(process.env.ESEWA_SECRET_KEY, '8gBm/:&EnhH.1/q'),
    productCode: devOnly(process.env.ESEWA_PRODUCT_CODE, 'EPAYTEST'),
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    folder: process.env.CLOUDINARY_FOLDER || 'achar-ghar',
    get enabled() {
      return Boolean(this.cloudName && this.apiKey && this.apiSecret);
    },
  },

  email: {
    /**
     * `brevo` sends over HTTPS; `smtp` uses nodemailer. Defaults to whichever is
     * configured, preferring Brevo - hosts on free tiers (Render among them) block the
     * outbound SMTP ports, so an API transport is the only one that reaches anyone.
     */
    provider: (process.env.EMAIL_PROVIDER || (process.env.BREVO_API_KEY ? 'brevo' : 'smtp'))
      .trim()
      .toLowerCase(),
    brevoApiKey: process.env.BREVO_API_KEY || '',
    host: process.env.EMAIL_HOST || '',
    port: int(process.env.EMAIL_PORT, 587),
    secure: bool(process.env.EMAIL_SECURE, int(process.env.EMAIL_PORT, 587) === 465),
    user: process.env.EMAIL_USER || '',
    password: process.env.EMAIL_PASSWORD || '',
    from: process.env.EMAIL_FROM || 'Achar Ghar <no-reply@acharghar.com.np>',
    get enabled() {
      return this.provider === 'brevo'
        ? Boolean(this.brevoApiKey)
        : Boolean(this.host && this.user && this.password);
    },
  },

  seed: {
    adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@acharghar.com.np',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || '',
    adminName: process.env.SEED_ADMIN_NAME || 'Achar Ghar Admin',
    /**
     * Shared password for the demo customer accounts. There is no default and the
     * seed refuses to create them in production, so a live database can never end up
     * with a set of accounts whose password is written in the repository.
     */
    demoPassword: process.env.SEED_DEMO_PASSWORD || '',
  },

  uploadMaxBytes: int(process.env.UPLOAD_MAX_BYTES, 5 * 1024 * 1024),
  // Reserved stock older than this (minutes) is released by the cleanup job.
  reservationTtlMinutes: int(process.env.RESERVATION_TTL_MINUTES, 45),
};

/**
 * Values shipped in `.env.example` and in this file's own fallbacks. Every one of
 * them is public, so a production process using any of them has no secret at all.
 *
 * A length check alone does not catch these: the placeholder JWT secrets are 48 and
 * 46 characters, comfortably past the 32 character minimum, which is exactly how a
 * copied `.env.example` reaches production with a signing key anyone can read on
 * GitHub. Substring matching on "change-me" rather than equality, so editing the
 * placeholder into `change-me-later-abc` does not sneak past.
 */
const PLACEHOLDER_MARKERS = ['change-me', 'your-secret', 'replace-me', 'xxxxx'];
const isPlaceholder = (value = '') =>
  PLACEHOLDER_MARKERS.some((marker) => value.toLowerCase().includes(marker));

/** eSewa's published sandbox credentials - valid only against rc-epay. */
const ESEWA_SANDBOX_SECRET = '8gBm/:&EnhH.1/q';
const ESEWA_SANDBOX_MERCHANT = 'EPAYTEST';

/**
 * Fails fast in production when a secret is still on its insecure development default.
 * Called from server.js before the HTTP listener starts.
 */
export function assertProductionEnv() {
  if (!env.isProd) return;

  const problems = [];
  if (!process.env.MONGO_URI) problems.push('MONGO_URI is required in production');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
    problems.push('JWT_SECRET must be set to a random string of at least 32 characters');
  if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32)
    problems.push('JWT_REFRESH_SECRET must be set to a random string of at least 32 characters');
  if (process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET)
    problems.push('JWT_SECRET and JWT_REFRESH_SECRET must differ');
  if (isPlaceholder(process.env.JWT_SECRET))
    problems.push('JWT_SECRET is still the example placeholder - generate a real one');
  if (isPlaceholder(process.env.JWT_REFRESH_SECRET))
    problems.push('JWT_REFRESH_SECRET is still the example placeholder - generate a real one');
  if (!process.env.CLIENT_URL) problems.push('CLIENT_URL is required in production');
  if (!env.cookie.secure) problems.push('COOKIE_SECURE must be true in production (HTTPS only)');

  /**
   * Sandbox payment credentials in production are worse than none: eSewa would accept
   * the redirect against rc-epay and the shop would mark real orders paid for money
   * that was never collected.
   */
  if (env.esewa.secretKey === ESEWA_SANDBOX_SECRET)
    problems.push('ESEWA_SECRET_KEY is eSewa\'s public sandbox key - set your live merchant key');
  if (env.esewa.merchantId === ESEWA_SANDBOX_MERCHANT)
    problems.push('ESEWA_MERCHANT_ID is still EPAYTEST - set your live merchant code');
  if (env.esewa.baseUrl.includes('rc-epay'))
    problems.push('ESEWA_BASE_URL still points at the sandbox (rc-epay.esewa.com.np)');
  if (env.khalti.secretKey && env.khalti.baseUrl.includes('dev.khalti.com'))
    problems.push('KHALTI_BASE_URL still points at the sandbox (dev.khalti.com)');

  if (problems.length) {
    throw new Error(`Invalid production configuration:\n  - ${problems.join('\n  - ')}`);
  }
}

export default env;
