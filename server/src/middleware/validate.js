import ApiError from '../utils/ApiError.js';

/**
 * Zod-backed request validation.
 *
 * `validate({ body, query, params })` parses each part with its schema and
 * replaces the request value with the *parsed* result, so controllers work with
 * coerced, trimmed, defaulted data and never re-check types.
 */
function formatIssues(issues) {
  const errors = {};
  for (const issue of issues) {
    const path = issue.path.join('.') || 'root';
    if (!errors[path]) errors[path] = issue.message;
  }
  return errors;
}

export function validate(schemas) {
  const parts = Object.entries(schemas);
  return (req, _res, next) => {
    for (const [part, schema] of parts) {
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (!result.success) {
        return next(
          ApiError.unprocessable('Please check the highlighted fields', {
            details: formatIssues(result.error.issues),
          })
        );
      }
      if (part === 'query' || part === 'params') {
        // These are lazy getters on Express 5 - mutate rather than reassign.
        Object.keys(req[part]).forEach((key) => {
          if (!(key in result.data)) delete req[part][key];
        });
        Object.assign(req[part], result.data);
      } else {
        req[part] = result.data;
      }
    }
    return next();
  };
}

export default validate;
