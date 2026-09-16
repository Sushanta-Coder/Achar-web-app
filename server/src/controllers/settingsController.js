import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import {
  getSettings,
  getPublicSettings,
  updateSettings,
  invalidateSettingsCache,
} from '../services/settingsService.js';
import { availableGateways } from '../services/payments/PaymentService.js';
import { getDeliveryTable } from '../services/deliveryService.js';
import { PROVINCES, DISTRICTS } from '../utils/nepal.js';
import { sanitizeHtml } from '../utils/sanitize.js';
import {
  CURRENCY,
  CURRENCY_SYMBOL,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  SORT_OPTIONS,
  SPICE_LEVELS,
  BLOG_CATEGORIES,
} from '../utils/constants.js';
import env from '../config/env.js';

/**
 * Site settings.
 *
 * The public endpoint is the storefront's bootstrap request: company details for
 * the header and footer, the announcement bar, homepage copy, SEO defaults and
 * which payment methods to offer. It is a projection, not the raw document -
 * `PUBLIC_SECTIONS` lists what may leave the server, so a future admin-only
 * field cannot be added to the schema and accidentally shipped to every visitor.
 *
 * No credentials live in settings at all: gateway keys and SMTP passwords are
 * environment variables, so `availableGateways()` reports whether Khalti is
 * usable without the key itself ever being readable through the API.
 */

const PUBLIC_SECTIONS = ['company', 'announcement', 'homepage', 'seo', 'commerce', 'maintenanceMode'];

/** Everything the storefront needs before it can render its first page. */
export const publicSettings = asyncHandler(async (_req, res) => {
  const [settings, gateways, delivery] = await Promise.all([
    getPublicSettings(),
    availableGateways(),
    getDeliveryTable(),
  ]);

  const projection = Object.fromEntries(
    PUBLIC_SECTIONS.map((section) => [section, settings[section]])
  );

  return sendSuccess(res, {
    data: {
      ...projection,
      payments: {
        // Enabled *and* actually configured - a toggle without a key is not an option.
        gateways,
        cod: {
          isEnabled: Boolean(settings.payments?.cod?.isEnabled),
          label: settings.payments?.cod?.label,
          maxOrderAmount: settings.payments?.cod?.maxOrderAmount ?? 0,
        },
        // Publishable by design; the secret key never leaves the server.
        khaltiPublicKey: env.khalti.publicKey || null,
      },
      delivery: {
        freeDeliveryThreshold: delivery.freeDeliveryThreshold,
        zones: delivery.zones,
      },
      currency: { code: CURRENCY, symbol: CURRENCY_SYMBOL },
    },
  });
});

/**
 * Static reference data the client would otherwise hardcode: provinces and
 * districts for the address form, sort options for the shop, status labels for
 * order tracking. Served from the server so the two never disagree.
 */
export const referenceData = asyncHandler(async (_req, res) =>
  sendSuccess(res, {
    data: {
      provinces: PROVINCES.map(({ name, nameNp, districts }) => ({ name, nameNp, districts })),
      districts: DISTRICTS,
      sortOptions: SORT_OPTIONS,
      spiceLevels: SPICE_LEVELS,
      blogCategories: BLOG_CATEGORIES,
      orderStatusLabels: ORDER_STATUS_LABELS,
      paymentMethodLabels: PAYMENT_METHOD_LABELS,
    },
  })
);

/** Province and district list on its own - the checkout form's only dependency. */
export const locations = asyncHandler(async (_req, res) =>
  sendSuccess(res, {
    data: {
      provinces: PROVINCES.map(({ name, nameNp, districts }) => ({ name, nameNp, districts })),
    },
  })
);

/**
 * Long-form policy pages (shipping, returns, privacy, terms, payment). Stored as
 * admin-authored HTML and sanitised on write, so these are safe to render.
 */
export const policy = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const settings = await getSettings();
  const content = settings.policies?.[slug];

  if (content === undefined) throw ApiError.notFound('Policy page not found');

  return sendSuccess(res, {
    data: {
      slug,
      content,
      // The client falls back to its own bundled copy when nothing is set yet, so a
      // fresh install still shows a complete Terms page.
      isEmpty: !content,
      updatedAt: settings.updatedAt,
    },
  });
});

// --- Admin -------------------------------------------------------------------

/** The whole document, for the Site Settings screens. */
export const adminGetSettings = asyncHandler(async (_req, res) => {
  const settings = await getSettings({ fresh: true });

  return sendSuccess(res, {
    data: {
      settings,
      // Read-only view of how the deployment is configured. Booleans only - never
      // the key material, even for an admin.
      integrations: {
        khaltiConfigured: Boolean(env.khalti.secretKey),
        esewaConfigured: Boolean(env.esewa.secretKey && env.esewa.productCode),
        cloudinaryConfigured: env.cloudinary.enabled,
        emailConfigured: env.email.enabled,
        khaltiBaseUrl: env.khalti.baseUrl,
        esewaBaseUrl: env.esewa.baseUrl,
        clientUrl: env.clientUrl,
        serverUrl: env.serverUrl,
      },
    },
  });
});

/**
 * Section-wise PATCH. The validator only permits keys the schema knows, and
 * `updateSettings` merges rather than replaces, so the admin UI can save just the
 * block it is editing without resending the whole document.
 */
export const adminUpdateSettings = asyncHandler(async (req, res) => {
  const patch = { ...req.body };

  // Policy bodies are the only rich text here.
  if (patch.policies) {
    patch.policies = Object.fromEntries(
      Object.entries(patch.policies).map(([key, value]) => [key, sanitizeHtml(value ?? '')])
    );
  }

  const settings = await updateSettings(patch);
  return sendSuccess(res, {
    message: 'Settings saved',
    data: { settings },
  });
});

/** SEO block on its own, so the SEO Settings screen cannot touch anything else. */
export const adminUpdateSeo = asyncHandler(async (req, res) => {
  const settings = await updateSettings({ seo: req.body });
  return sendSuccess(res, { message: 'SEO settings saved', data: { seo: settings.seo } });
});

export const adminUpdateHomepage = asyncHandler(async (req, res) => {
  const settings = await updateSettings({ homepage: req.body });
  return sendSuccess(res, { message: 'Homepage saved', data: { homepage: settings.homepage } });
});

/**
 * Maintenance mode. Kept as its own endpoint because it is the one setting an
 * admin may need to flip in a hurry, and because the middleware that enforces it
 * reads the cached document - so the cache must be dropped immediately.
 */
export const adminSetMaintenance = asyncHandler(async (req, res) => {
  const settings = await updateSettings({ maintenanceMode: Boolean(req.body.maintenanceMode) });
  invalidateSettingsCache();

  return sendSuccess(res, {
    message: settings.maintenanceMode
      ? 'Maintenance mode is ON - the storefront is closed to customers'
      : 'Maintenance mode is OFF - the storefront is open',
    data: { maintenanceMode: settings.maintenanceMode },
  });
});

export default {
  publicSettings,
  referenceData,
  locations,
  policy,
  adminGetSettings,
  adminUpdateSettings,
  adminUpdateSeo,
  adminUpdateHomepage,
  adminSetMaintenance,
};
