/**
 * server/middleware/rateLimiter.js
 * Express rate-limiting middleware.
 *
 * Two tiers:
 *  - apiLimiter:  applied to all /api/* routes (light guard, prevents scraping)
 *  - costLimiter: applied to /api/costs/* and /api/reservations/* (Azure API calls
 *                 are expensive and throttled; stricter limit prevents cascading throttle)
 *
 * Limits are configurable via RATE_LIMIT_API and RATE_LIMIT_COST env vars.
 */

import rateLimit from 'express-rate-limit';
import config from '../config.js';

const clientIp = (req) =>
  (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();

export const apiLimiter = rateLimit({
  windowMs: config.rateLimit.apiWindowMs,
  max: config.rateLimit.apiMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientIp,
  message: { error: 'Too many requests — please wait before retrying.' },
  skip: (req) => req.path === '/api/health',
});

export const costLimiter = rateLimit({
  windowMs: config.rateLimit.costWindowMs,
  max: config.rateLimit.costMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientIp,
  message: { error: 'Too many cost analysis requests — please wait before retrying.' },
});
