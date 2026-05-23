/**
 * server/middleware/errorHandler.js
 * Centralized Express error handler.
 *
 * Guarantees:
 *  - Azure SDK error details (stack traces, internal messages) never reach the client
 *    for 5xx responses — only a sanitized message is returned.
 *  - 4xx errors from Azure (auth, not found, throttling) are mapped to appropriate
 *    HTTP status codes with actionable messages.
 *  - Every error response includes the request correlation ID for log correlation.
 *  - Full error detail is logged server-side for diagnosis.
 *
 * asyncRoute: thin wrapper that forwards async handler rejections to next(err)
 * so route handlers don't need boilerplate try/catch.
 */

import { logger } from './logger.js';

const AZURE_AUTH_CODES = new Set(['AuthenticationError', 'AuthorizationFailed', 'InvalidAuthenticationToken']);

function mapHttpStatus(err) {
  if (err.statusCode === 429) return 429;
  if (err.statusCode === 404) return 404;
  if (err.statusCode === 401 || err.statusCode === 403 || AZURE_AUTH_CODES.has(err.code)) return 403;
  return err.statusCode || err.status || 500;
}

function clientMessage(httpStatus, err) {
  if (httpStatus === 403 || AZURE_AUTH_CODES.has(err.code)) {
    return 'Azure authentication or authorization failed. Verify credential configuration and RBAC role assignments.';
  }
  if (httpStatus === 429) {
    return 'Azure API rate limit reached. Please wait before retrying.';
  }
  if (httpStatus === 404) {
    return 'The requested Azure resource or scope was not found.';
  }
  if (httpStatus >= 500) {
    return 'An internal server error occurred. Check server logs for details.';
  }
  return err.message;
}

export function errorHandler(err, req, res, _next) {
  const httpStatus = mapHttpStatus(err);

  logger.error('unhandled error', {
    requestId: req.id,
    method: req.method,
    path: req.path,
    httpStatus,
    errorCode: err.code,
    message: err.message,
    stack: err.stack?.split('\n').slice(0, 4).join(' | '),
  });

  res.status(httpStatus).json({
    error: clientMessage(httpStatus, err),
    ...(err.code && { code: err.code }),
    requestId: req.id,
  });
}

export const asyncRoute = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
