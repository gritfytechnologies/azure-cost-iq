/**
 * server/index.js
 * AzureCostIQ — Express backend
 *
 * Runs on PORT (default 3001). Vite dev server proxies /api/* to this process.
 * In production (Azure App Service), the compiled frontend is served from /dist
 * and the API is served from /api/*.
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
import { validateCredential } from './auth.js';
import { temporalAttributionMiddleware } from './middleware/temporal.js';
import scopeRoutes from './routes/scope.js';
import reservationRoutes from './routes/reservations.js';
import costRoutes from './routes/costs.js';
import recommendationRoutes from './routes/recommendations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const IS_PROD = process.env.NODE_ENV === 'production';

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(compression());
app.use(express.json({ limit: '2mb' }));

// Security headers — no CORS needed (same-origin in prod; Vite proxy in dev)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Strict no external data: CSP locks down to same-origin only
  if (IS_PROD) {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;");
  }
  next();
});

app.use(temporalAttributionMiddleware);

// Request logging
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    const start = Date.now();
    res.on('finish', () => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
    });
  }
  next();
});

// ─── Azure Retail Prices proxy (existing feature — no auth) ──────────────────

app.get('/api/prices', async (req, res) => {
  try {
    const params = new URLSearchParams(req.query);
    const url = `https://prices.azure.com/api/retail/prices?${params.toString()}`;
    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!resp.ok) return res.status(resp.status).json({ error: 'Upstream pricing API error' });
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach Azure Retail Prices API', detail: err.message });
  }
});

// ─── Health / auth status ──────────────────────────────────────────────────────

app.get('/api/health', async (req, res) => {
  const authOk = await validateCredential().catch(() => false);
  res.json({
    status: 'ok',
    version: '4.0.0',
    timestamp: new Date().toISOString(),
    azure: {
      credentialConfigured: !!(process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID),
      authValid: authOk,
      defaultScope: process.env.DEFAULT_SCOPE || null,
      authMethod: process.env.AZURE_CLIENT_SECRET ? 'ServicePrincipal/Secret'
        : process.env.AZURE_CLIENT_CERTIFICATE_PATH ? 'ServicePrincipal/Certificate'
        : 'DefaultAzureCredential (ManagedIdentity/CLI)',
    },
    dataPolicy: 'All Azure API calls are read-only. No data leaves this server to third parties.',
  });
});

// ─── API routes ────────────────────────────────────────────────────────────────

app.use('/api/scope',           scopeRoutes);
app.use('/api/reservations',    reservationRoutes);
app.use('/api/costs',           costRoutes);
app.use('/api/recommendations', recommendationRoutes);

// ─── Serve frontend in production ─────────────────────────────────────────────

if (IS_PROD) {
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath, { maxAge: '1d', index: false }));
  // SPA fallback — all non-API routes return index.html
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'API route not found' });
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\nAzureCostIQ Backend v4.0.0`);
  console.log(`Port:        ${PORT}`);
  console.log(`Mode:        ${IS_PROD ? 'production' : 'development'}`);
  console.log(`Health:      http://localhost:${PORT}/api/health\n`);
});

export default app;
