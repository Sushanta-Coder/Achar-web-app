/**
 * Every JSON response in the API has the same envelope:
 *   { success, message, data?, meta?, errors? }
 * Keeping it in one place means the client can rely on it unconditionally.
 */

export function sendSuccess(res, { status = 200, message = 'OK', data, meta } = {}) {
  const body = { success: true, message };
  if (data !== undefined) body.data = data;
  if (meta !== undefined) body.meta = meta;
  return res.status(status).json(body);
}

export function sendCreated(res, { message = 'Created successfully', data, meta } = {}) {
  return sendSuccess(res, { status: 201, message, data, meta });
}

export function sendError(res, { status = 500, message = 'Something went wrong', errors } = {}) {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(status).json(body);
}

/**
 * Pagination metadata shared by every list endpoint.
 */
export function paginationMeta({ page, limit, total }) {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

export default { sendSuccess, sendCreated, sendError, paginationMeta };
