import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import env from './config/env.js';
import logger from './config/logger.js';
/**
 * Side-effect import: registers every Mongoose schema before a request can trigger a
 * `populate()` on a model nothing has touched yet. Also means `syncIndexes()` on a
 * cold production start sees all of them - the unique index on `orderNumber`
 * included - rather than only those some earlier import happened to pull in.
 */
import './models/index.js';
import routes from './routes/index.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { csrfProtection, verifyOrigin } from './middleware/csrf.js';
import { maintenanceMode } from './middleware/maintenance.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { sanitizeRequest } from './utils/sanitize.js';
import { uploadRoot, activeDriver } from './services/imageStorage.js';
import * as seo from './controllers/seoController.js';

/**
 * The Express application, with no listener attached.
 *
 * Kept separate from `server.js` so the test suite can mount it against an
 * in-memory MongoDB with supertest, without binding a port or installing the signal
 * handlers that would then leak between test files.
 *
 * Middleware order below is deliberate and mostly load-bearing; each step notes what
 * it depends on having run before it.
 */
const app = express();

/**
 * Render, Railway and any Nginx VPS put the app behind a proxy, so without this the
 * rate limiter keys every visitor to the proxy's IP (one shared bucket for the whole
 * internet) and `secure` cookies are never set. `1` rather than `true`: trusting the
 * whole chain would let a client forge `X-Forwarded-For` and evade the limiter.
 */
app.set('trust proxy', 1);
// The API is JSON; an ETag on a personalised cart response is a cache-poisoning risk.
app.set('etag', false);
app.disable('x-powered-by');

/**
 * `crossOriginResourcePolicy` is relaxed because product images are served from
 * Cloudinary and embedded by the storefront on a different origin. CSP is set on the
 * *frontend* host rather than here - this process serves JSON, not documents, so a
 * policy declared on an API response protects nothing.
 */
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  })
);

/**
 * The allow-list is the configured client URL plus anything named in `CORS_ORIGINS`
 * (preview deployments, the Nepali VPS domain). `credentials: true` is required for
 * the HTTP-only session cookie to travel at all.
 */
const allowedOrigins = [env.clientUrl, ...env.corsOrigins].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header: curl, server-to-server, and the gateway callbacks.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Outside production, a developer on any localhost port is allowed through -
      // in production an unknown origin is simply denied CORS, not 500'd.
      if (!env.isProd) return callback(null, true);
      logger.warn(`CORS: blocked origin ${origin}`);
      return callback(null, false);
    },
    credentials: true,
    exposedHeaders: ['Content-Disposition'], // CSV exports name their own file.
  })
);

app.use(compression());

/**
 * The body limit is small on purpose. Images go to Cloudinary through the multipart
 * upload routes (multer enforces its own limit there), so no legitimate JSON request
 * in this API is anywhere near 100kb - a larger cap would only widen the surface for
 * memory-pressure attacks.
 */
app.use(express.json({ limit: '100kb' }));
/**
 * eSewa returns the customer to us with an HTML form POST, so the callback arrives
 * as `application/x-www-form-urlencoded` rather than JSON. Without this the callback
 * body is empty and every eSewa payment appears to fail.
 */
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());

if (!env.isTest) {
  app.use(
    morgan(env.isProd ? 'combined' : 'dev', {
      stream: { write: (line) => logger.http(line.trim()) },
      // Health checks fire every few seconds and would drown the log.
      skip: (req) => req.path === '/api/health',
    })
  );
}

/**
 * Locally-stored uploads, served back to the storefront.
 *
 * Only mounted when the local storage driver is active - with Cloudinary configured
 * there is nothing on disk to serve and the route would be dead weight.
 *
 * Above the rate limiter and the CSRF check on purpose: a product page pulling eight
 * gallery images should not spend eight of a visitor's API tokens, and a static image
 * is not a state change. Reads only - `express.static` has no write path - and
 * `dotfiles: 'deny'` plus multer's mime allow-list mean nothing but the image files
 * the upload endpoint wrote is reachable.
 */
if (activeDriver() === 'local') {
  app.use(
    '/uploads',
    express.static(uploadRoot, {
      dotfiles: 'deny',
      index: false,
      // Filenames carry a random suffix, so a given URL's bytes never change.
      maxAge: '30d',
      immutable: true,
      /**
       * Falls through on a miss so a deleted image reaches `notFoundHandler` and comes
       * back as the API's own 404 envelope. `fallthrough: false` raises an error object
       * the error handler does not recognise, turning a missing file into a 500.
       */
      fallthrough: true,
    })
  );
}

/** Strips `$`-prefixed and dotted keys, so a query object cannot become an operator. */
app.use(sanitizeRequest);

/**
 * Both after `cookieParser` (they read the CSRF cookie) and after the body parsers,
 * because `req.path` on the callback routes must already be resolved for the exempt
 * prefixes to match.
 */
app.use(verifyOrigin(allowedOrigins));
app.use(csrfProtection);

app.use('/api', apiLimiter);
/**
 * After the limiter, so a flood cannot force a settings read per request, and after
 * auth is *available* but before the routers - the middleware checks `req.user?.role`
 * defensively rather than assuming it is populated.
 */
app.use(maintenanceMode);

app.use('/api', routes);

/**
 * Crawlers ask for these at the domain root, not under `/api`. The frontend host
 * rewrites its own `/sitemap.xml` and `/robots.txt` here (see `vercel.json` /
 * `netlify.toml`); these root aliases mean the documents also resolve when the API
 * is browsed directly, and when the whole stack sits behind one Nginx server block
 * on a Nepali VPS.
 */
app.get('/sitemap.xml', seo.sitemap);
app.get('/robots.txt', seo.robots);

/** Friendly root, so hitting the API domain in a browser is not a bare 404. */
app.get('/', (_req, res) =>
  res.json({
    name: 'Achar Ghar API',
    version: '1.0.0',
    docs: `${env.clientUrl}`,
    health: '/api/health',
  })
);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
