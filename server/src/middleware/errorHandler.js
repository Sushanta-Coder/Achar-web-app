import mongoose from 'mongoose';
import env from '../config/env.js';
import logger from '../config/logger.js';
import ApiError from '../utils/ApiError.js';
import { sendError } from '../utils/ApiResponse.js';

/** 404 for any unmatched route, so the client always receives the JSON envelope. */
export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
}

function normalise(error) {
  if (error instanceof ApiError) return error;

  // Mongoose validation -> 422 with per-field messages.
  if (error instanceof mongoose.Error.ValidationError) {
    const errors = Object.fromEntries(
      Object.entries(error.errors).map(([field, err]) => [field, err.message])
    );
    return ApiError.unprocessable('Please check the highlighted fields', { details: errors });
  }

  // Bad ObjectId / number cast -> 400 rather than a 500.
  if (error instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid value for "${error.path}"`);
  }

  // Duplicate key -> 409 naming the conflicting field.
  if (error?.code === 11000) {
    const field = Object.keys(error.keyPattern ?? error.keyValue ?? {})[0] ?? 'value';
    const pretty = field.split('.').pop();
    return ApiError.conflict(`That ${pretty} is already in use`);
  }

  if (error?.name === 'JsonWebTokenError') return ApiError.unauthorized('Invalid session token');
  if (error?.name === 'TokenExpiredError') return ApiError.unauthorized('Your session has expired');

  // Body larger than the configured limit.
  if (error?.type === 'entity.too.large') {
    return ApiError.badRequest('Request payload is too large');
  }
  if (error?.type === 'entity.parse.failed') {
    return ApiError.badRequest('Request body is not valid JSON');
  }
  if (error?.code === 'LIMIT_FILE_SIZE') {
    return ApiError.badRequest('Uploaded file exceeds the maximum allowed size');
  }
  if (error?.code === 'LIMIT_FILE_COUNT') {
    return ApiError.badRequest('Too many files in one upload');
  }
  if (error?.code === 'LIMIT_UNEXPECTED_FILE') {
    return ApiError.badRequest(`Unexpected file field "${error.field}"`);
  }

  return null;
}

/**
 * Centralised error handler. Anything that is not a known operational error is
 * logged with its stack and reported as a generic 500 - stack traces and driver
 * internals never reach the client in production.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
export function errorHandler(error, req, res, next) {
  const known = normalise(error);

  if (!known) {
    logger.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, error);
    const body = { success: false, message: 'Something went wrong on our side' };
    if (!env.isProd) body.errors = { debug: error?.message, stack: error?.stack?.split('\n') };
    return res.status(500).json(body);
  }

  if (known.statusCode >= 500) {
    logger.error(`${known.statusCode} on ${req.method} ${req.originalUrl}:`, error);
  } else {
    logger.debug(`${known.statusCode} on ${req.method} ${req.originalUrl}: ${known.message}`);
  }

  return sendError(res, {
    status: known.statusCode,
    message: known.expose ? known.message : 'Something went wrong on our side',
    errors: known.details,
  });
}

export default errorHandler;
