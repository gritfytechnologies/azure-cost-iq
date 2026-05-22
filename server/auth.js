/**
 * server/auth.js
 * Azure credential factory for AzureCostIQ.
 *
 * Priority order (matches DefaultAzureCredential):
 *   1. Service Principal (env vars)  — local dev / CI
 *   2. Managed Identity              — Azure App Service / AKS
 *
 * Required RBAC roles (assign at tenant root MG for full visibility):
 *   - Cost Management Reader        (read cost & usage data)
 *   - Reservations Reader           (view reservation orders & usage)
 *   - Management Group Reader       (list management group hierarchy)
 *   - Reader                        (view resource metadata in subscriptions)
 *
 * Required env vars for Service Principal auth:
 *   AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
 */

import {
  DefaultAzureCredential,
  ClientSecretCredential,
  ClientCertificateCredential,
  ManagedIdentityCredential,
  ChainedTokenCredential,
} from '@azure/identity';

let _credential = null;

/**
 * Returns a cached Azure credential.
 * Uses SP when all three env vars are present; falls back to DefaultAzureCredential
 * which will try Managed Identity, Azure CLI, and other sources in order.
 */
export function getCredential() {
  if (_credential) return _credential;

  const { AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_CLIENT_CERTIFICATE_PATH } = process.env;

  if (AZURE_TENANT_ID && AZURE_CLIENT_ID && AZURE_CLIENT_SECRET) {
    _credential = new ClientSecretCredential(
      AZURE_TENANT_ID,
      AZURE_CLIENT_ID,
      AZURE_CLIENT_SECRET,
    );
    console.log('[auth] Using Service Principal credential (client secret)');
    return _credential;
  }

  if (AZURE_TENANT_ID && AZURE_CLIENT_ID && AZURE_CLIENT_CERTIFICATE_PATH) {
    // Certificate-based SP — more secure for production
    _credential = new ClientCertificateCredential(
      AZURE_TENANT_ID,
      AZURE_CLIENT_ID,
      AZURE_CLIENT_CERTIFICATE_PATH,
    );
    console.log('[auth] Using Service Principal credential (certificate)');
    return _credential;
  }

  // DefaultAzureCredential: tries environment, workload identity, managed identity, CLI, etc.
  _credential = new DefaultAzureCredential();
  console.log('[auth] Using DefaultAzureCredential (Managed Identity / CLI / env)');
  return _credential;
}

/**
 * Warm-up: attempt a token fetch at startup to catch misconfig early.
 * Does not throw — logs warning if auth fails so server still starts.
 */
export async function validateCredential() {
  try {
    const cred = getCredential();
    await cred.getToken('https://management.azure.com/.default');
    console.log('[auth] Credential validated — Azure Management API reachable');
    return true;
  } catch (err) {
    console.warn('[auth] Credential validation failed:', err.message);
    console.warn('[auth] Set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET to enable live data');
    return false;
  }
}
