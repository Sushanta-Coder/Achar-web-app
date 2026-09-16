/**
 * Wraps an async route handler so rejected promises reach Express' error
 * middleware instead of becoming unhandled rejections.
 */
export default function asyncHandler(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
