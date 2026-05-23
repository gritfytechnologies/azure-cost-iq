/**
 * server/config.js
 * Validates required environment variables at startup and exports a typed
 * configuration object used throughout the server.
 *
 * Hard-codes no defaults for credentials — missing required vars in production
 * cause an immediate, informative process exit rather than a runtime auth failure.
 */

const REQUIRED_IN_PROD = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID'];

const IS_PROD = process.env.NODE_ENV === 'production';

const missing = REQUIRED_IN_PROD.filter((k) => !process.env[k]);
if (missing.length) {
  const msg = `Missing required environment variables: ${missing.join(', ')}`;
  if (IS_PROD) {
    console.error(`[startup] FATAL: ${msg}`);
    process.exit(1);
  } else {
    console.warn(`[startup] WARNING: ${msg} — Azure API calls will fail.`);
  }
}

const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  isProd: IS_PROD,
  version: '4.0.0',

  azure: {
    tenantId: process.env.AZURE_TENANT_ID || '',
    clientId: process.env.AZURE_CLIENT_ID || '',
    defaultScope: process.env.DEFAULT_SCOPE || null,
    authMethod: process.env.AZURE_CLIENT_SECRET
      ? 'ServicePrincipal/Secret'
      : process.env.AZURE_CLIENT_CERTIFICATE_PATH
        ? 'ServicePrincipal/Certificate'
        : 'DefaultAzureCredential',
  },

  rateLimit: {
    // General API: 120 requests per 15 minutes per IP
    apiWindowMs: 15 * 60 * 1000,
    apiMax: parseInt(process.env.RATE_LIMIT_API || '120', 10),
    // Cost/reservation queries (expensive Azure API calls): 30 per minute per IP
    costWindowMs: 60 * 1000,
    costMax: parseInt(process.env.RATE_LIMIT_COST || '30', 10),
  },
};

export default config;
