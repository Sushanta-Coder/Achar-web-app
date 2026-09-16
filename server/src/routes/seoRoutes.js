import { Router } from 'express';
import * as seo from '../controllers/seoController.js';

/**
 * `/api/seo`
 *
 * Deliberately unauthenticated and uncached-by-cookie: everything here is what a
 * crawler sees. The controller builds every absolute URL from the configured client
 * URL rather than the request's Host header, so reaching these through a preview
 * domain still yields canonical production links.
 *
 * `app.js` also mounts `/sitemap.xml` and `/robots.txt` at the API root, and the
 * frontend host rewrites its own `/sitemap.xml` and `/robots.txt` here - so the
 * documents live at the address crawlers actually look for, on the domain customers
 * actually visit.
 */
const router = Router();

router.get('/sitemap.xml', seo.sitemap);
router.get('/robots.txt', seo.robots);
/**
 * The JSON-LD `@graph` the client injects into `<head>`. Built server-side from the
 * same settings document that renders the footer, so the business name, address and
 * phone in the structured data can never drift from the ones on the page.
 */
router.get('/structured-data', seo.structuredData);

export default router;
