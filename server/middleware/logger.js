/**
 * server/middleware/logger.js
 * Structured logger and request-logging middleware.
 *
 * Outputs JSON in production (suitable for log aggregators such as Azure Monitor,
 * Splunk, ELK). Outputs human-readable lines in development.
 *
 * Each incoming API request is assigned a UUID correlation ID that is:
 *  - stored on req.id
 *  - echoed back in the X-Request-Id response header
 *  - included in every log line emitted during that request's lifecycle
 */

import { randomUUID } from 'crypto';

const IS_PROD = process.env.NODE_ENV === 'production';

function fmt(level, message, extra = {}) {
  if (IS_PROD) {
    return JSON.stringify({ ts: new Date().toISOString(), level, msg: message, ...extra });
  }
  const ts = new Date().toISOString().slice(11, 23);
  const tag = level.toUpperCase().padEnd(5);
  const extras = Object.keys(extra).length ? ' ' + JSON.stringify(extra) : '';
  return `[${ts}] ${tag} ${message}${extras}`;
}

export const logger = {
  info:  (msg, extra) => console.log(fmt('info',  msg, extra)),
  warn:  (msg, extra) => console.warn(fmt('warn',  msg, extra)),
  error: (msg, extra) => console.error(fmt('error', msg, extra)),
  debug: (msg, extra) => { if (!IS_PROD) console.log(fmt('debug', msg, extra)); },
};

/**
 * Express middleware: assigns a correlation ID, injects X-Request-Id header,
 * and logs each completed API request with method, path, status, and duration.
 */
export function requestLogger(req, res, next) {
  req.id = req.headers['x-request-id'] || randomUUID();
  res.setHeader('X-Request-Id', req.id);

  if (!req.path.startsWith('/api')) return next();

  const start = Date.now();
  res.on('finish', () => {
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]('request', {
      requestId: req.id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
      ip: (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim(),
    });
  });

  next();
}
