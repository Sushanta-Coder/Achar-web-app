import env from '../../../config/env.js';
import ApiError from '../../../utils/ApiError.js';
import { PAYMENT_METHODS } from '../../../utils/constants.js';

/**
 * Cash on delivery.
 *
 * Not a gateway, but it implements the same interface so `PaymentService` has one
 * registry and no `if (method === 'cod')` branches. Money is collected by the
 * courier, so the order is marked paid when an admin sets it to Delivered.
 */
const name = PAYMENT_METHODS.COD;
const label = 'Cash on Delivery';

function isConfigured() {
  return true;
}

async function initiate() {
  throw ApiError.badRequest('Cash on delivery orders do not need an online payment');
}

async function verify() {
  throw ApiError.badRequest('Cash on delivery is confirmed by our delivery team, not online');
}

function extractRef() {
  return null;
}

/** Where the browser goes straight after a COD order is placed. */
function successUrl(order) {
  return `${env.clientUrl}/order-success/${order.orderNumber}`;
}

export default { name, label, isConfigured, initiate, verify, extractRef, successUrl };
