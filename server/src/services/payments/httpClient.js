import axios from 'axios';
import logger from '../../config/logger.js';
import ApiError from '../../utils/ApiError.js';

/**
 * Shared HTTP plumbing for payment gateways.
 *
 * Gateways are the one dependency that will time out on a Friday evening, so every
 * call gets an explicit timeout and a single retry for network-level failures only
 * (never for a 4xx, which would risk double-charging).
 */
const TIMEOUT_MS = 20_000;

export function createGatewayClient({ baseURL, headers = {} }) {
  return axios.create({
    baseURL,
    timeout: TIMEOUT_MS,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
  });
}

/**
 * Runs a gateway request and turns anything unusable into a typed ApiError.
 * `retryOnNetworkError` is safe for idempotent lookups; leave it off for initiation.
 */
export async function gatewayRequest(label, request, { retryOnNetworkError = false } = {}) {
  const attempts = retryOnNetworkError ? 2 : 1;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await request();
      return response.data;
    } catch (error) {
      lastError = error;
      const status = error.response?.status;

      if (status) {
        logger.error(
          `${label} responded ${status}: ${JSON.stringify(error.response.data).slice(0, 500)}`
        );
        throw ApiError.badRequest(gatewayMessage(error.response.data), {
          code: 'GATEWAY_REJECTED',
          details: { gatewayStatus: status },
        });
      }

      logger.error(`${label} network failure (attempt ${attempt}/${attempts}): ${error.message}`);
      if (attempt < attempts) await delay(600 * attempt);
    }
  }

  throw new ApiError(
    503,
    'We could not reach the payment provider. Please try again in a moment.',
    { code: 'GATEWAY_UNREACHABLE', details: { cause: lastError?.message } }
  );
}

/** Pulls a human-usable sentence out of the very different gateway error shapes. */
function gatewayMessage(data) {
  if (!data) return 'The payment provider rejected this request';
  if (typeof data === 'string') return data.slice(0, 200);

  const candidate =
    data.detail ??
    data.message ??
    data.error_message ??
    (Array.isArray(data.error_key) ? data.error_key[0] : data.error_key) ??
    firstFieldError(data);

  return typeof candidate === 'string' && candidate.trim()
    ? candidate.slice(0, 200)
    : 'The payment provider rejected this request';
}

function firstFieldError(data) {
  for (const value of Object.values(data)) {
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    if (typeof value === 'string') return value;
  }
  return null;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default { createGatewayClient, gatewayRequest };
