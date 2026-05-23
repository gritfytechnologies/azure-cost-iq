/**
 * server/index.js
 * AzureCostIQ — Express backend
 *
 * Runs on PORT (default 3001). Vite dev server proxies /api/* to this process.
 * In production the compiled frontend is served from /dist and the API from /api/*.
 *
 * All Azure API calls stay server-side. No Azure credentials ever reach the browser.
 * No data is sent to third-party services. All network calls go to:
 *   - Azure Management APIs (management.azure.com) — read-only
 *   - Azure Retail Prices API (prices.azure.com) — public, no auth required
 */

import express from 'express';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';

import config from './config.js';
import { logger, requestLogger } from './middleware/logger.js';
import { apiLimiter, costLimiter } from './middleware/rateLimiter.js';
import { errorHandler, asyncRoute } from './middleware/errorHandler.js';
import { validateCredential } from './auth.js';
import { temporalAttributionMiddleware } from './middleware/temporal.js';
import scopeRoutes from './routes/scope.js';
import reservationRoutes from './routes/reservations.js';
import costRoutes from './routes/costs.js';
import recommendationRoutes from './routes/recommendations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(compression());
app.use(express.json({ limit: '1mb' }));

// Correlation ID + structured request logging (before rate limiting so IDs are set)
app.use(requestLogger);

// Rate limiting
app.use('/api', apiLimiter);
app.use('/api/costs', costLimiter);
app.use('/api/reservations', costLimiter);

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Powered-By-Override', '');
  res.removeHeader('X-Powered-By');
  if (config.isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;"
    );
  }
  next();
});

app.use(temporalAttributionMiddleware);

// ─── Azure Retail Prices proxy (public, no auth) ──────────────────────────────

app.get('/api/prices', asyncRoute(async (req, res) => {
  const params = new URLSearchParams(req.query);
  const url = `https://prices.azure.com/api/retail/prices?${params.toString()}`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) {
    return res.status(resp.status).json({ error: 'Upstream pricing API error', requestId: req.id });
  }
  res.json(await resp.json());
}));

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/api/health', asyncRoute(async (req, res) => {
  const authOk = await validateCredential().catch(() => false);
  res.json({
    status: authOk ? 'ok' : 'degraded',
    version: config.version,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    azure: {
      credentialConfigured: !!(config.azure.tenantId && config.azure.clientId),
      authValid: authOk,
    },
    dataPolicy: 'All Azure API calls are read-only. No data leaves this server to third parties.',
    requestId: req.id,
  });
}));

// ─── API routes ────────────────────────────────────────────────────────────────

app.use('/api/scope',           scopeRoutes);
app.use('/api/reservations',    reservationRoutes);
app.use('/api/costs',           costRoutes);
app.use('/api/recommendations', recommendationRoutes);

// ─── Serve frontend in production ─────────────────────────────────────────────

if (config.isProd) {
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath, { maxAge: '1d', index: false }));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'API route not found', requestId: req.id });
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ─── Centralized error handler (must be last) ─────────────────────────────────

app.use(errorHandler);

// ─── Graceful shutdown ────────────────────────────────────────────────────────

const server = app.listen(config.port, () => {
  logger.info('AzureCostIQ backend started', {
    version: config.version,
    port: config.port,
    mode: config.isProd ? 'production' : 'development',
    authMethod: config.azure.authMethod,
  });
});

function shutdown(signal) {
  logger.info(`${signal} received — draining connections`);
  server.close(() => {
    logger.info('HTTP server closed cleanly');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
});

export default app;
