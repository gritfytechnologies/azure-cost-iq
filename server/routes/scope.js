/**
 * server/routes/scope.js
 * Scope discovery — list available management groups, subscriptions, tenant.
 *
 * GET /api/scope/options   — returns all scopes the SP/MI has access to
 * GET /api/scope/validate  — validates a specific scope string
 *
 * Scope format accepted by cost/reservation APIs:
 *   Tenant root:       /providers/Microsoft.Management/managementGroups/<tenantId>
 *   Management group:  /providers/Microsoft.Management/managementGroups/<mgId>
 *   Subscription:      /subscriptions/<subscriptionId>
 */

import { Router } from 'express';
import armManagementGroups from '@azure/arm-managementgroups';
const { ManagementGroupsAPI } = armManagementGroups;
import { SubscriptionClient } from '@azure/arm-subscriptions';
import { getCredential } from '../auth.js';

const router = Router();

/**
 * GET /api/scope/options
 * Returns a structured list: tenant root → management groups → subscriptions.
 * Frontend uses this to populate the scope selector dropdown.
 */
router.get('/options', async (req, res) => {
  try {
    const cred = getCredential();
    const scopes = [];

    // Management groups
    const mgClient = new ManagementGroupsAPI(cred);
    for await (const mg of mgClient.managementGroups.list()) {
      scopes.push({
        type: mg.id.includes(process.env.AZURE_TENANT_ID || '') ? 'tenant-root' : 'management-group',
        id: mg.id,
        displayName: mg.displayName || mg.name,
        name: mg.name,
        scope: mg.id,
        level: mg.properties?.details?.depth ?? null,
      });
    }

    // Subscriptions
    const subClient = new SubscriptionClient(cred);
    for await (const sub of subClient.subscriptions.list()) {
      scopes.push({
        type: 'subscription',
        id: sub.subscriptionId,
        displayName: sub.displayName,
        name: sub.subscriptionId,
        scope: `/subscriptions/${sub.subscriptionId}`,
        state: sub.state,
      });
    }

    scopes.sort((a, b) => {
      const order = { 'tenant-root': 0, 'management-group': 1, subscription: 2 };
      return (order[a.type] ?? 9) - (order[b.type] ?? 9);
    });

    res.json({ scopes, count: scopes.length });
  } catch (err) {
    const isAuth = err.statusCode === 401 || err.statusCode === 403 || err.code === 'AuthenticationError';
    res.status(isAuth ? 403 : 500).json({
      error: isAuth
        ? 'Authentication failed. Check AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET and RBAC role assignments.'
        : `Scope discovery failed: ${err.message}`,
      code: err.code || 'SCOPE_ERROR',
    });
  }
});

/**
 * GET /api/scope/validate?scope=<scopeUri>
 * Confirms the credential has at least Reader on the requested scope.
 */
router.get('/validate', async (req, res) => {
  const { scope } = req.query;
  if (!scope) return res.status(400).json({ error: 'scope query parameter required' });

  try {
    const cred = getCredential();
    const token = await cred.getToken('https://management.azure.com/.default');
    if (!token) throw new Error('No token returned');

    res.json({
      valid: true,
      scope,
      tokenExpiry: token.expiresOnTimestamp ? new Date(token.expiresOnTimestamp).toISOString() : null,
    });
  } catch (err) {
    res.status(403).json({ valid: false, scope, error: err.message });
  }
});

export default router;
