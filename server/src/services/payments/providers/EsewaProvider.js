import crypto from 'node:crypto';
import env from '../../../config/env.js';
import logger from '../../../config/logger.js';
import ApiError from '../../../utils/ApiError.js';
import { timingSafeEqual } from '../../../utils/tokens.js';
import { createGatewayClient, gatewayRequest } from '../httpClient.js';
import { PAYMENT_METHODS } from '../../../utils/constants.js';

/**
 * eSewa ePay v2 provider.
 *
 * Flow:
 *   1. We build a signed form and the browser POSTs it to eSewa
 *   2. eSewa redirects to success_url?data=<base64 JSON> (or failure_url)
 *   3. We check the HMAC signature on that payload, then call the transaction
 *      status API for an authoritative answer
 *
 * Step 3 matters: the `data` payload is signed, but a signature only proves eSewa
 * produced it *at some point*, not that it belongs to this order or is still valid.
 * The status API is what we actually trust.
 *
 * The signature covers `total_amount,transaction_uuid,product_code` as an ordered,
 * comma-joined `key=value` string, HMAC-SHA256 with the merchant secret, base64.
 */

const SIGNED_FIELDS = ['total_amount', 'transaction_uuid', 'product_code'];

/** eSewa statuses mapped onto our normalised vocabulary. */
const STATUS_MAP = {
  COMPLETE: 'paid',
  PENDING: 'pending',
  CANCELED: 'cancelled',
  CANCELLED: 'cancelled',
  FULL_REFUND: 'refunded',
  PARTIAL_REFUND: 'refunded',
  AMBIGUOUS: 'pending',
  NOT_FOUND: 'unknown',
};

let client = null;
function getClient() {
  if (!client) client = createGatewayClient({ baseURL: env.esewa.baseUrl });
  return client;
}

const name = PAYMENT_METHODS.ESEWA;
const label = 'eSewa';

function isConfigured() {
  return Boolean(env.esewa.secretKey && env.esewa.productCode);
}

function assertConfigured() {
  if (!isConfigured()) {
    logger.error('eSewa payment attempted but ESEWA_SECRET_KEY/ESEWA_PRODUCT_CODE are not set');
    throw ApiError.badRequest('eSewa payments are not available right now');
  }
}

/** base64(HMAC-SHA256(secret, "k1=v1,k2=v2,...")) over the given field order. */
function sign(values, fields = SIGNED_FIELDS) {
  const message = fields.map((field) => `${field}=${values[field]}`).join(',');
  return crypto.createHmac('sha256', env.esewa.secretKey).update(message).digest('base64');
}

/**
 * Builds the signed form the browser submits. Nothing here is secret except the
 * signature input, and the secret itself never leaves the server.
 *
 * `order` is part of the provider interface every gateway receives, but eSewa needs
 * only the amount: its v2 signature is computed over the payment fields alone. Khalti
 * is the provider that reads the order itself.
 */
async function initiate({ payment, returnUrl, failureUrl }) {
  assertConfigured();

  // eSewa recomputes total_amount = amount + tax_amount + service + delivery and
  // rejects a mismatch, so we send the whole thing as one goods amount. Our own
  // breakdown already lives on the order.
  const total = String(payment.amount);
  const fields = {
    amount: total,
    tax_amount: '0',
    total_amount: total,
    transaction_uuid: payment.gatewayRef,
    product_code: env.esewa.productCode,
    product_service_charge: '0',
    product_delivery_charge: '0',
    success_url: returnUrl,
    failure_url: failureUrl,
    signed_field_names: SIGNED_FIELDS.join(','),
  };
  fields.signature = sign(fields);

  return {
    // The client renders a hidden auto-submitting form: eSewa v2 has no JSON
    // initiation endpoint, the browser must POST these fields itself.
    method: 'form',
    formUrl: `${env.esewa.baseUrl}/api/epay/main/v2/form`,
    fields,
    reference: payment.gatewayRef,
    snapshot: { transactionUuid: payment.gatewayRef, totalAmount: total },
  };
}

/**
 * Decodes the `data` query parameter into a plain object.
 * Returns null when the payload is missing or not valid base64 JSON.
 */
function decodeCallback(callbackData = {}) {
  if (!callbackData.data) return null;
  try {
    return JSON.parse(Buffer.from(String(callbackData.data), 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

/** Our reference, from the signed payload if present, else a bare query param. */
function extractRef(callbackData = {}) {
  const decoded = decodeCallback(callbackData);
  return decoded?.transaction_uuid ?? callbackData.transaction_uuid ?? null;
}

/** eSewa formats amounts as "1,000.0" - normalise to whole rupees. */
function parseAmount(value) {
  const numeric = Number.parseFloat(String(value ?? '0').replace(/,/g, ''));
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

async function verify({ payment, callbackData = {} }) {
  assertConfigured();

  const decoded = decodeCallback(callbackData);

  // When a signed payload is present it must be genuine and it must be *this*
  // payment. Both checks run before we spend a network call on the status API.
  if (decoded) {
    if (!verifySignature(decoded)) {
      logger.error(`eSewa signature check failed for ${payment.gatewayRef}`);
      throw ApiError.badRequest('Payment signature verification failed', {
        code: 'INVALID_SIGNATURE',
      });
    }
    if (decoded.transaction_uuid !== payment.gatewayRef) {
      logger.error(
        `eSewa reference mismatch: stored=${payment.gatewayRef} received=${decoded.transaction_uuid}`
      );
      throw ApiError.badRequest('This payment does not match our records', {
        code: 'REFERENCE_MISMATCH',
      });
    }
  }

  const data = await gatewayRequest(
    `${label} status check`,
    () =>
      getClient().get('/api/epay/transaction/status/', {
        params: {
          product_code: env.esewa.productCode,
          total_amount: payment.amount,
          transaction_uuid: payment.gatewayRef,
        },
      }),
    { retryOnNetworkError: true }
  );

  const status = STATUS_MAP[String(data?.status ?? '').toUpperCase()] ?? 'failed';
  if (status === 'unknown') {
    throw ApiError.notFound('eSewa has no record of this transaction', {
      code: 'UNKNOWN_TRANSACTION',
    });
  }

  return {
    status,
    amount: parseAmount(data?.total_amount),
    transactionId: data?.ref_id ?? decoded?.transaction_code ?? null,
    reason: status === 'paid' ? undefined : `eSewa reported status "${data?.status}"`,
    raw: {
      status: data?.status,
      refId: data?.ref_id ?? null,
      totalAmount: data?.total_amount,
      transactionUuid: data?.transaction_uuid ?? payment.gatewayRef,
      transactionCode: decoded?.transaction_code ?? null,
    },
  };
}

/**
 * Recomputes the HMAC over exactly the fields eSewa says it signed, in the order it
 * says it signed them, and compares in constant time.
 */
function verifySignature(decoded) {
  if (!decoded?.signature || !decoded?.signed_field_names) return false;
  const fields = String(decoded.signed_field_names)
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);
  if (!fields.length) return false;
  return timingSafeEqual(sign(decoded, fields), decoded.signature);
}

export default {
  name,
  label,
  isConfigured,
  initiate,
  verify,
  extractRef,
  // Exported for the unit tests that assert signature handling.
  _internal: { sign, verifySignature, decodeCallback, parseAmount },
};
