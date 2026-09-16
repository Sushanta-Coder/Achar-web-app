/**
 * Operational error carrying an HTTP status. Anything thrown that is *not* an
 * ApiError is treated as a programming bug by the error handler and reported as a
 * generic 500 without leaking internals.
 */
export default class ApiError extends Error {
  constructor(statusCode, message, { code, details, expose = true } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.expose = expose;
    this.isOperational = true;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = 'Bad request', options) {
    return new ApiError(400, message, options);
  }

  static unauthorized(message = 'Authentication required', options) {
    return new ApiError(401, message, options);
  }

  static forbidden(message = 'You do not have permission to perform this action', options) {
    return new ApiError(403, message, options);
  }

  static notFound(message = 'Resource not found', options) {
    return new ApiError(404, message, options);
  }

  static conflict(message = 'Request conflicts with the current state', options) {
    return new ApiError(409, message, options);
  }

  static unprocessable(message = 'Validation failed', options) {
    return new ApiError(422, message, options);
  }

  static tooMany(message = 'Too many requests, please try again later', options) {
    return new ApiError(429, message, options);
  }

  static internal(message = 'Something went wrong', options) {
    return new ApiError(500, message, { ...options, expose: false });
  }

  /**
   * An upstream service we depend on answered, but not usefully - a Khalti lookup
   * that timed out, a Cloudinary upload that was rejected. The message stays
   * exposed because it tells the caller to retry, not how we are built.
   */
  static badGateway(message = 'An upstream service did not respond correctly', options) {
    return new ApiError(502, message, options);
  }

  /**
   * A dependency is switched off or not configured for this deployment. Exposed on
   * purpose: "image uploads are not configured" is far more useful than a 500.
   */
  static serviceUnavailable(message = 'This feature is temporarily unavailable', options) {
    return new ApiError(503, message, options);
  }
}
