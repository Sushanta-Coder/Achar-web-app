import env from '../../../config/env.js';
import logger from '../../../config/logger.js';
import ApiError from '../../../utils/ApiError.js';
import { rupeesToPaisa, paisaToRupees } from '../../../utils/money.js';
import { createGatewayClient, gatewayRequest } from '../httpClient.js';
import { PAYMENT_METHODS } from '../../../utils/constants.js';

/**
 * Khalti ePayment (KPG-2) provider.
 *
 * Flow:
 *   1. POST /epayment/initiate/  -> { pidx, payment_url }
 *   2. Browser goes to payment_url, Khalti redirects to our return_url with `pidx`
 *   3. POST /epayment/lookup/    -> authoritative status + amount
 *
 * Step 3 is the only thing we believe. The redirect query string is treated purely
 * as a hint that *a* payment happened, because anyone can craft that URL.
 *
 * Amounts are handled in paisa on the wire and rupees everywhere in our domain.
 */

/** Khalti lookup statuses mapped onto our normalised vocabulary. */
const STATUS_MAP = {
  Completed: 'paid',
  Pending: 'pending',
  Initiated: 'pending',
  Refunded: 'refunded',
  Expired: 'expired',
  'User canceled': 'cancelled',
  Canceled: 'cancelled',
  Cancelled: 'cancelled',
};

let client = null;
function getClient() {
  if (!client) {
    client = createGatewayClient({
      baseURL: env.khalti.baseUrl,
      headers: { Authorization: `Key ${env.khalti.secretKey}` },
    });
  }
  return client;
}

const name = PAYMENT_METHODS.KHALTI;
const label = 'Khalti';

function isConfigured() {
  return Boolean(env.khalti.secretKey);
}

function assertConfigured() {
  if (!isConfigured()) {
    logger.error('Khalti payment attempted but KHALTI_SECRET_KEY is not set');
    throw ApiError.badRequest('Khalti payments are not available right now');
  }
}

/**
 * Asks Khalti for a payment URL.
 *
 * `amount` comes from the persisted order total - never from the request body - so a
 * tampered client cannot lower what it is asked to pay.
 */
async function initiate({ order, payment, returnUrl }) {
  assertConfigured();

  const payload = {
    return_url: returnUrl,
    website_url: env.clientUrl,
    amount: rupeesToPaisa(payment.amount),
    purchase_order_id: payment.gatewayRef,
    purchase_order_name: `Order ${order.orderNumber}`,
    customer_info: {
      name: order.customer.name,
      email: order.customer.email,
      phone: order.customer.phone,
    },
    amount_breakdown: buildBreakdown(order),
    product_details: order.items.slice(0, 10).map((item) => ({
      identity: item.sku,
      name: `${item.name} (${item.size})`,
      total_price: rupeesToPaisa(item.lineTotal),
      quantity: item.quantity,
      unit_price: rupeesToPaisa(item.unitPrice),
    })),
  };

  const data = await gatewayRequest(`${label} initiate`, () =>
    getClient().post('/epayment/initiate/', payload)
  );

  if (!data?.pidx || !data?.payment_url) {
    throw ApiError.badRequest('Khalti did not return a payment link. Please try again.');
  }

  return {
    // How the client should hand over to the gateway.
    method: 'redirect',
    redirectUrl: data.payment_url,
    // Stored so verification can look the payment up even if the callback is thin.
    reference: data.pidx,
    expiresAt: data.expires_at ?? null,
    snapshot: { pidx: data.pidx, expiresAt: data.expires_at ?? null },
  };
}

/**
 * Khalti's breakdown must add up to `amount` exactly or initiation is rejected,
 * so discounts are folded into the goods line rather than sent as negatives.
 */
function buildBreakdown(order) {
  const { subtotal, couponDiscount, deliveryCharge, taxAmount } = order.pricing;
  const breakdown = [{ label: 'Items', amount: rupeesToPaisa(subtotal - couponDiscount) }];
  if (deliveryCharge > 0) {
    breakdown.push({ label: 'Delivery charge', amount: rupeesToPaisa(deliveryCharge) });
  }
  if (taxAmount > 0) breakdown.push({ label: 'VAT', amount: rupeesToPaisa(taxAmount) });
  return breakdown;
}

/** Our reference as it comes back on the redirect, used to find the Payment row. */
function extractRef(callbackData = {}) {
  return callbackData.purchase_order_id ?? null;
}

/**
 * Server-side verification via lookup. Returns the gateway's own view of the
 * transaction; the caller compares the amount and decides what to do.
 */
async function verify({ payment, callbackData = {} }) {
  assertConfigured();

  const storedPidx = payment.responseSnapshot?.pidx ?? null;
  const pidx = storedPidx ?? callbackData.pidx;
  if (!pidx) {
    throw ApiError.badRequest('Missing Khalti payment identifier', { code: 'UNKNOWN_TRANSACTION' });
  }

  // A pidx belongs to exactly one initiation. If the browser comes back with a
  // different one, someone is replaying another order's callback.
  if (storedPidx && callbackData.pidx && callbackData.pidx !== storedPidx) {
    logger.error(
      `Khalti pidx mismatch for ${payment.gatewayRef}: stored=${storedPidx} received=${callbackData.pidx}`
    );
    throw ApiError.badRequest('This payment does not match our records', {
      code: 'REFERENCE_MISMATCH',
    });
  }

  const data = await gatewayRequest(
    `${label} lookup`,
    () => getClient().post('/epayment/lookup/', { pidx }),
    { retryOnNetworkError: true }
  );

  const status = STATUS_MAP[data?.status] ?? 'failed';

  return {
    status,
    amount: paisaToRupees(data?.total_amount ?? 0),
    transactionId: data?.transaction_id ?? null,
    reason: status === 'paid' ? undefined : `Khalti reported status "${data?.status}"`,
    raw: {
      pidx: data?.pidx,
      status: data?.status,
      totalAmountPaisa: data?.total_amount,
      transactionId: data?.transaction_id ?? null,
      fee: data?.fee ?? 0,
      refunded: Boolean(data?.refunded),
    },
  };
}

export default { name, label, isConfigured, initiate, verify, extractRef };
