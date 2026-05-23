/**
 * server/routes/costs.js
 * Azure Cost Management analysis endpoints.
 *
 * GET /api/costs/summary          — MTD actual + prior month comparison
 * GET /api/costs/trend            — month-over-month cost trend (rolling 6 months)
 * GET /api/costs/by-service       — cost grouped by Azure service name
 * GET /api/costs/by-resource-group— cost grouped by resource group
 * GET /api/costs/by-tag           — cost grouped by a specific tag key
 * GET /api/costs/by-subscription  — cost grouped by subscription (MG scope only)
 * GET /api/costs/budgets          — active budgets and current vs budget spend
 *
 * All endpoints require ?scope= parameter (validated format).
 */

import { Router } from 'express';
import { CostManagementClient } from '@azure/arm-costmanagement';
import armConsumption from '@azure/arm-consumption';
const { ConsumptionManagementClient } = armConsumption;
import { getCredential } from '../auth.js';
import { buildTemporalMeta } from '../middleware/temporal.js';
import { asyncRoute } from '../middleware/errorHandler.js';
import { requireScope } from '../utils/scope.js';

const router = Router();

// ─── Date helpers ─────────────────────────────────────────────────────────────

function currentBillingPeriod() {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0],
    to:   now.toISOString().split('T')[0],
    status: 'PRELIMINARY',
  };
}

function priorBillingPeriod() {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0],
    to:   new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0],
    status: 'FINAL',
  };
}

function monthStart(monthsAgo) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsAgo);
  return d.toISOString().split('T')[0];
}

function monthEnd(monthsAgo) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsAgo + 1);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

// ─── Core query helper ────────────────────────────────────────────────────────

async function runCostQuery(client, scope, { from, to }, groupBy = []) {
  return client.query.usage(scope, {
    type: 'ActualCost',
    dataSet: {
      granularity: 'None',
      aggregation: {
        totalCost:    { name: 'Cost',    function: 'Sum' },
        totalCostUSD: { name: 'CostUSD', function: 'Sum' },
      },
      grouping: groupBy,
    },
    timeframe: 'Custom',
    timePeriod: { from: new Date(from), to: new Date(to) },
  });
}

// ─── /api/costs/summary ───────────────────────────────────────────────────────

router.get('/summary', asyncRoute(async (req, res) => {
  const scope = requireScope(req, res);
  if (!scope) return;

  const cred = getCredential();
  const client = new CostManagementClient(cred);

  const current = currentBillingPeriod();
  const prior   = priorBillingPeriod();

  const [currentResult, priorResult] = await Promise.all([
    runCostQuery(client, scope, current),
    runCostQuery(client, scope, prior),
  ]);

  const currentCost = currentResult?.rows?.[0]?.[0] || 0;
  const priorCost   = priorResult?.rows?.[0]?.[0] || 0;
  const momChange   = priorCost > 0 ? ((currentCost - priorCost) / priorCost) * 100 : null;

  res.json({
    currentPeriod: {
      from: current.from,
      to:   current.to,
      totalCost: Math.round(currentCost * 100) / 100,
      status: current.status,
    },
    priorPeriod: {
      from: prior.from,
      to:   prior.to,
      totalCost: Math.round(priorCost * 100) / 100,
      status: prior.status,
    },
    momChangePercent: momChange !== null ? Math.round(momChange * 10) / 10 : null,
    annualRunRate: Math.round(currentCost * 12 * 100) / 100,
    currency: currentResult?.rows?.[0]?.[2] || 'USD',
    _temporal: buildTemporalMeta({ scope, billingStart: current.from, billingEnd: current.to, apiVersion: '2023-11-01' }),
  });
}));

// ─── /api/costs/trend ─────────────────────────────────────────────────────────

router.get('/trend', asyncRoute(async (req, res) => {
  const scope = requireScope(req, res);
  if (!scope) return;

  const months = Math.min(Math.max(parseInt(req.query.months || '6', 10), 1), 12);
  const cred   = getCredential();
  const client = new CostManagementClient(cred);

  const trend = await Promise.all(
    Array.from({ length: months }, (_, i) => {
      const ago = months - 1 - i;
      return runCostQuery(client, scope, { from: monthStart(ago), to: monthEnd(ago) })
        .then(r => ({
          month:  monthStart(ago).slice(0, 7),
          cost:   Math.round((r?.rows?.[0]?.[0] || 0) * 100) / 100,
          status: ago === 0 ? 'PRELIMINARY' : 'FINAL',
        }))
        .catch(() => ({ month: monthStart(ago).slice(0, 7), cost: 0, status: 'ERROR' }));
    })
  );

  res.json({
    trend,
    avgMonthly: Math.round((trend.reduce((s, m) => s + m.cost, 0) / trend.length) * 100) / 100,
    peakMonth:  trend.reduce((a, b) => a.cost > b.cost ? a : b, trend[0]),
    _temporal: buildTemporalMeta({ scope, billingStart: monthStart(months - 1), billingEnd: monthEnd(0), apiVersion: '2023-11-01' }),
  });
}));

// ─── /api/costs/by-service ────────────────────────────────────────────────────

router.get('/by-service', asyncRoute(async (req, res) => {
  const scope = requireScope(req, res);
  if (!scope) return;

  const cred   = getCredential();
  const client = new CostManagementClient(cred);
  const period = currentBillingPeriod();

  const result = await runCostQuery(client, scope, period, [{ type: 'Dimension', name: 'ServiceName' }]);

  const services = (result?.rows || [])
    .map(row => ({ service: row[2] || 'Unknown', cost: Math.round((row[0] || 0) * 100) / 100, costUSD: Math.round((row[1] || 0) * 100) / 100 }))
    .sort((a, b) => b.cost - a.cost);

  const total = services.reduce((s, i) => s + i.cost, 0);

  res.json({
    services: services.map(s => ({ ...s, pctOfTotal: total > 0 ? Math.round((s.cost / total) * 1000) / 10 : 0 })),
    total: Math.round(total * 100) / 100,
    topService: services[0] || null,
    _temporal: buildTemporalMeta({ scope, billingStart: period.from, billingEnd: period.to, apiVersion: '2023-11-01' }),
  });
}));

// ─── /api/costs/by-resource-group ────────────────────────────────────────────

router.get('/by-resource-group', asyncRoute(async (req, res) => {
  const scope = requireScope(req, res);
  if (!scope) return;

  const cred   = getCredential();
  const client = new CostManagementClient(cred);
  const period = currentBillingPeriod();

  const result = await runCostQuery(client, scope, period, [{ type: 'Dimension', name: 'ResourceGroupName' }]);

  const groups = (result?.rows || [])
    .map(row => ({ resourceGroup: row[2] || 'Unknown', cost: Math.round((row[0] || 0) * 100) / 100 }))
    .sort((a, b) => b.cost - a.cost);

  const total = groups.reduce((s, g) => s + g.cost, 0);

  res.json({
    resourceGroups: groups.map(g => ({ ...g, pctOfTotal: total > 0 ? Math.round((g.cost / total) * 1000) / 10 : 0 })),
    total: Math.round(total * 100) / 100,
    _temporal: buildTemporalMeta({ scope, billingStart: period.from, billingEnd: period.to, apiVersion: '2023-11-01' }),
  });
}));

// ─── /api/costs/by-tag ────────────────────────────────────────────────────────

router.get('/by-tag', asyncRoute(async (req, res) => {
  const scope  = requireScope(req, res);
  if (!scope) return;

  const tagKey = (req.query.tagKey || 'Environment').slice(0, 128);

  const cred   = getCredential();
  const client = new CostManagementClient(cred);
  const period = currentBillingPeriod();

  const result = await runCostQuery(client, scope, period, [{ type: 'TagKey', name: tagKey }]);

  const tags = (result?.rows || [])
    .map(row => ({ tagValue: row[2] || '(untagged)', cost: Math.round((row[0] || 0) * 100) / 100 }))
    .sort((a, b) => b.cost - a.cost);

  const total       = tags.reduce((s, t) => s + t.cost, 0);
  const untaggedCost = tags.find(t => t.tagValue === '(untagged)')?.cost || 0;

  res.json({
    tagKey,
    tags: tags.map(t => ({ ...t, pctOfTotal: total > 0 ? Math.round((t.cost / total) * 1000) / 10 : 0 })),
    total: Math.round(total * 100) / 100,
    tagCoveragePercent: total > 0 ? Math.round(((total - untaggedCost) / total) * 100) : 0,
    _temporal: buildTemporalMeta({ scope, billingStart: period.from, billingEnd: period.to, apiVersion: '2023-11-01' }),
  });
}));

// ─── /api/costs/by-subscription ───────────────────────────────────────────────

router.get('/by-subscription', asyncRoute(async (req, res) => {
  const scope = requireScope(req, res);
  if (!scope) return;

  const cred   = getCredential();
  const client = new CostManagementClient(cred);
  const period = currentBillingPeriod();

  const result = await runCostQuery(client, scope, period, [{ type: 'Dimension', name: 'SubscriptionName' }]);

  const subscriptions = (result?.rows || [])
    .map(row => ({ subscription: row[2] || 'Unknown', cost: Math.round((row[0] || 0) * 100) / 100 }))
    .sort((a, b) => b.cost - a.cost);

  const total = subscriptions.reduce((s, i) => s + i.cost, 0);

  res.json({
    subscriptions: subscriptions.map(s => ({ ...s, pctOfTotal: total > 0 ? Math.round((s.cost / total) * 1000) / 10 : 0 })),
    total: Math.round(total * 100) / 100,
    _temporal: buildTemporalMeta({ scope, billingStart: period.from, billingEnd: period.to, apiVersion: '2023-11-01' }),
  });
}));

// ─── /api/costs/budgets ───────────────────────────────────────────────────────

router.get('/budgets', asyncRoute(async (req, res) => {
  const scope = requireScope(req, res);
  if (!scope) return;

  const cred   = getCredential();
  const client = new ConsumptionManagementClient(cred);
  const period = currentBillingPeriod();

  const budgets = [];
  for await (const b of client.budgets.list(scope)) {
    const currentSpend = b.properties?.currentSpend?.amount || 0;
    const budgetAmount = b.properties?.amount || 0;
    budgets.push({
      name:           b.name,
      amount:         budgetAmount,
      currentSpend:   Math.round(currentSpend * 100) / 100,
      spendPercent:   budgetAmount > 0 ? Math.round((currentSpend / budgetAmount) * 100) : null,
      forecastedSpend: b.properties?.forecastSpend?.amount || null,
      timeGrain:      b.properties?.timeGrain,
      category:       b.properties?.category,
      status:         currentSpend > budgetAmount ? 'EXCEEDED'
                    : currentSpend > budgetAmount * 0.8 ? 'AT_RISK'
                    : 'ON_TRACK',
    });
  }

  res.json({
    budgets,
    _temporal: buildTemporalMeta({ scope, billingStart: period.from, billingEnd: period.to, apiVersion: '2021-10-01' }),
  });
}));

export default router;
