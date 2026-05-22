/**
 * server/routes/reservations.js
 * Reserved Instance & Azure Savings Plan endpoints.
 *
 * GET /api/reservations              — all reservation orders + line items
 * GET /api/reservations/usage        — utilization % (last 7d and 30d per reservation)
 * GET /api/reservations/savings      — actual savings vs PAYG for each reservation
 * GET /api/reservations/expiring     — reservations expiring within 90 days
 * GET /api/reservations/underutilized — reservations below 80% utilization
 */

import { Router } from 'express';
import armReservations from '@azure/arm-reservations';
import armConsumption from '@azure/arm-consumption';
const { ReservationsManagementClient } = armReservations;
const { ConsumptionManagementClient } = armConsumption;
import { getCredential } from '../auth.js';
import { buildTemporalMeta } from '../middleware/temporal.js';

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getScopeFromQuery(req) {
  return req.query.scope || process.env.DEFAULT_SCOPE || null;
}

function billingPeriod(monthsAgo = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo, 1);
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  const endDate = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${endDate.getDate()}`;
  return { start, end };
}

/** Map Azure reservation term to human label */
const TERM_LABELS = { P1Y: '1 Year', P3Y: '3 Years' };

/** Map service type names to readable labels */
const SERVICE_TYPE_LABELS = {
  'VirtualMachines': 'Virtual Machines',
  'SqlDatabases': 'SQL Database',
  'SqlManagedInstances': 'SQL Managed Instance',
  'CosmosDb': 'Cosmos DB',
  'RedisCache': 'Redis Cache',
  'AppServicePlanv2': 'App Service Plan',
  'AzureDataExplorer': 'Azure Data Explorer',
  'AzureDatabricks': 'Azure Databricks',
  'ManagedDisk': 'Managed Disk',
  'BlobStorage': 'Blob Storage',
  'DataLakeStorage': 'ADLS Gen2',
};

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/reservations
 * All reservation orders visible to this credential, with line items.
 */
router.get('/', async (req, res) => {
  try {
    const cred = getCredential();
    const client = new ReservationsManagementClient(cred);
    const orders = [];

    for await (const order of client.reservationOrder.list()) {
      const lineItems = [];

      try {
        for await (const item of client.reservation.list(order.name)) {
          lineItems.push({
            reservationId: item.name,
            displayName: item.displayName || item.name,
            sku: item.sku?.name,
            location: item.location,
            quantity: item.properties?.quantity,
            appliedScopeType: item.properties?.appliedScopeType,
            appliedScopes: item.properties?.appliedScopes,
            provisioningState: item.properties?.provisioningState,
            effectiveDateTime: item.properties?.effectiveDateTime,
            expiryDate: item.properties?.expiryDate,
            lastUpdatedDateTime: item.properties?.lastUpdatedDateTime,
            instanceFlexibility: item.properties?.instanceFlexibility,
          });
        }
      } catch { /* some orders may 403 on line items */ }

      orders.push({
        orderId: order.name,
        displayName: order.displayName || order.name,
        term: order.term,
        termLabel: TERM_LABELS[order.term] || order.term,
        billingPlan: order.billingPlan,
        purchaseDate: order.createdDateTime,
        expiryDate: order.expiryDateTime,
        originalQuantity: order.originalQuantity,
        provisioningState: order.provisioningState,
        reservedResourceType: order.reservedResourceType,
        serviceTypeLabel: SERVICE_TYPE_LABELS[order.reservedResourceType] || order.reservedResourceType,
        billingScope: order.billingScope,
        reservations: lineItems,
        reservationCount: lineItems.length,
        daysUntilExpiry: order.expiryDateTime
          ? Math.ceil((new Date(order.expiryDateTime) - new Date()) / (1000 * 60 * 60 * 24))
          : null,
      });
    }

    const period = billingPeriod(0);
    res.locals.temporalOpts = {
      scope: getScopeFromQuery(req),
      billingStart: period.start,
      billingEnd: period.end,
      apiVersion: '2022-11-01',
    };

    const _temporal = buildTemporalMeta(res.locals.temporalOpts);

    res.json({
      orders,
      summary: {
        totalOrders: orders.length,
        totalReservations: orders.reduce((s, o) => s + o.reservationCount, 0),
        expiringIn90Days: orders.filter(o => o.daysUntilExpiry !== null && o.daysUntilExpiry <= 90 && o.daysUntilExpiry > 0).length,
        byServiceType: groupByServiceType(orders),
      },
      _temporal,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message, code: err.code });
  }
});

function groupByServiceType(orders) {
  return orders.reduce((acc, o) => {
    const label = o.serviceTypeLabel || 'Other';
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
}

/**
 * GET /api/reservations/usage
 * Per-reservation utilization summaries (monthly grain).
 * Returns last 3 months of utilization % per order.
 */
router.get('/usage', async (req, res) => {
  try {
    const scope = getScopeFromQuery(req);
    if (!scope) return res.status(400).json({ error: 'scope query parameter required' });

    const cred = getCredential();
    const client = new ConsumptionManagementClient(cred);

    const period = billingPeriod(0);
    const filter = `properties/usageDate ge '${period.start}' AND properties/usageDate le '${period.end}'`;

    const usage = [];
    for await (const item of client.reservationsSummaries.list(scope, 'monthly', { $filter: filter })) {
      usage.push({
        reservationOrderId: item.reservationOrderId,
        reservationId: item.reservationId,
        skuName: item.skuName,
        reservedHours: item.reservedHours,
        usedHours: item.usedHours,
        utilizationPct: item.reservedHours > 0
          ? Math.round((item.usedHours / item.reservedHours) * 100 * 10) / 10
          : 0,
        avgUtilizationPct: item.avgUtilizationPercentage,
        minUtilizationPct: item.minUtilizationPercentage,
        maxUtilizationPct: item.maxUtilizationPercentage,
        usageDate: item.usageDate,
        purchasedQuantity: item.purchasedQuantity,
        remainingQuantity: item.remainingQuantity,
        totalReservedQuantity: item.totalReservedQuantity,
        usedQuantity: item.usedQuantity,
      });
    }

    // Also get 7-day rolling average
    const sevenDayPeriod = recentDays(7);
    const recentUsage = [];
    const filter7 = `properties/usageDate ge '${sevenDayPeriod.start}' AND properties/usageDate le '${sevenDayPeriod.end}'`;
    for await (const item of client.reservationsSummaries.list(scope, 'daily', { $filter: filter7 })) {
      recentUsage.push(item);
    }

    // Aggregate to per-reservation avg over last 7 days
    const recent7DayAvg = recentUsage.reduce((acc, item) => {
      const key = `${item.reservationOrderId}/${item.reservationId}`;
      if (!acc[key]) acc[key] = { sum: 0, count: 0 };
      acc[key].sum += item.avgUtilizationPercentage || 0;
      acc[key].count++;
      return acc;
    }, {});

    const period7Day = Object.entries(recent7DayAvg).map(([key, v]) => ({
      key,
      avgUtilization7d: Math.round((v.sum / v.count) * 10) / 10,
    }));

    const _temporal = buildTemporalMeta({
      scope,
      billingStart: period.start,
      billingEnd: period.end,
      apiVersion: '2021-10-01',
    });

    res.json({ usage, recent7DayAvg: period7Day, _temporal });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * GET /api/reservations/savings
 * Computes actual savings: (PAYG rate × used hours) - (RI amortized cost × used hours)
 * Uses the reservations detail API which has both amortized and on-demand costs.
 */
router.get('/savings', async (req, res) => {
  try {
    const scope = getScopeFromQuery(req);
    if (!scope) return res.status(400).json({ error: 'scope query parameter required' });

    const cred = getCredential();
    const client = new ConsumptionManagementClient(cred);

    const period = billingPeriod(0);
    const filter = `properties/usageDate ge '${period.start}' AND properties/usageDate le '${period.end}'`;

    let totalPaygCost = 0;
    let totalAmortizedCost = 0;
    let totalUsedHours = 0;
    const byOrder = {};

    for await (const item of client.reservationsSummaries.list(scope, 'monthly', { $filter: filter })) {
      // Savings = what you would have paid PAYG - what you actually paid (amortized)
      const paygEquivalent = (item.onDemandRate || 0) * (item.usedHours || 0);
      const amortizedCost = (item.amortizedCost || 0) * (item.usedHours || 0);
      const saving = Math.max(0, paygEquivalent - amortizedCost);

      totalPaygCost += paygEquivalent;
      totalAmortizedCost += amortizedCost;
      totalUsedHours += item.usedHours || 0;

      const key = item.reservationOrderId;
      if (!byOrder[key]) {
        byOrder[key] = {
          reservationOrderId: key,
          skuName: item.skuName,
          paygEquivalent: 0,
          amortizedCost: 0,
          saving: 0,
          savingPct: 0,
          usedHours: 0,
          utilizationPct: 0,
        };
      }
      byOrder[key].paygEquivalent += paygEquivalent;
      byOrder[key].amortizedCost += amortizedCost;
      byOrder[key].saving += saving;
      byOrder[key].usedHours += item.usedHours || 0;
      byOrder[key].utilizationPct = item.avgUtilizationPercentage;
    }

    // Compute saving % per order
    const byOrderArr = Object.values(byOrder).map(o => ({
      ...o,
      savingPct: o.paygEquivalent > 0 ? Math.round((o.saving / o.paygEquivalent) * 100) : 0,
    })).sort((a, b) => b.saving - a.saving);

    const totalSaving = totalPaygCost - totalAmortizedCost;
    const period12 = billingPeriod(11); // rolling 12 months

    const _temporal = buildTemporalMeta({
      scope,
      billingStart: period.start,
      billingEnd: period.end,
      apiVersion: '2021-10-01',
    });

    res.json({
      summary: {
        currentMonthPaygEquivalent: Math.round(totalPaygCost * 100) / 100,
        currentMonthAmortizedCost: Math.round(totalAmortizedCost * 100) / 100,
        currentMonthSaving: Math.round(totalSaving * 100) / 100,
        savingPercent: totalPaygCost > 0 ? Math.round((totalSaving / totalPaygCost) * 100) : 0,
        projectedAnnualSaving: Math.round(totalSaving * 12 * 100) / 100,
        totalUsedHours: Math.round(totalUsedHours),
        currency: 'USD',
      },
      byOrder: byOrderArr,
      _temporal,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * GET /api/reservations/expiring
 * Reservations expiring within 90 days — actionable for renewal planning.
 */
router.get('/expiring', async (req, res) => {
  try {
    const cred = getCredential();
    const client = new ReservationsManagementClient(cred);
    const daysThreshold = parseInt(req.query.days || '90', 10);
    const expiring = [];
    const now = new Date();

    for await (const order of client.reservationOrder.list()) {
      if (!order.expiryDateTime) continue;
      const expiry = new Date(order.expiryDateTime);
      const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

      if (daysLeft > 0 && daysLeft <= daysThreshold) {
        expiring.push({
          orderId: order.name,
          displayName: order.displayName || order.name,
          serviceType: SERVICE_TYPE_LABELS[order.reservedResourceType] || order.reservedResourceType,
          term: TERM_LABELS[order.term] || order.term,
          expiryDate: order.expiryDateTime,
          daysUntilExpiry: daysLeft,
          quantity: order.originalQuantity,
          urgency: daysLeft <= 30 ? 'HIGH' : daysLeft <= 60 ? 'MEDIUM' : 'LOW',
          action: daysLeft <= 30 ? 'Renew immediately to avoid PAYG billing gap' : 'Plan renewal within 30 days',
        });
      }
    }

    expiring.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
    res.json({ expiring, count: expiring.length });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * GET /api/reservations/underutilized
 * Reservations below 80% average utilization — candidates for exchange or reduction.
 */
router.get('/underutilized', async (req, res) => {
  try {
    const scope = getScopeFromQuery(req);
    if (!scope) return res.status(400).json({ error: 'scope query parameter required' });

    const cred = getCredential();
    const client = new ConsumptionManagementClient(cred);
    const threshold = parseFloat(req.query.threshold || '80');

    const period = billingPeriod(0);
    const filter = `properties/usageDate ge '${period.start}' AND properties/usageDate le '${period.end}'`;

    const summaries = [];
    for await (const item of client.reservationsSummaries.list(scope, 'monthly', { $filter: filter })) {
      if ((item.avgUtilizationPercentage || 0) < threshold) {
        const unusedHours = (item.reservedHours || 0) - (item.usedHours || 0);
        const wastedCost = (item.onDemandRate || 0) * unusedHours;
        summaries.push({
          reservationOrderId: item.reservationOrderId,
          reservationId: item.reservationId,
          skuName: item.skuName,
          avgUtilization: item.avgUtilizationPercentage,
          reservedHours: item.reservedHours,
          usedHours: item.usedHours,
          unusedHours: Math.round(unusedHours),
          estimatedWastedCost: Math.round(wastedCost * 100) / 100,
          recommendation: getUnderutilizedRecommendation(item.avgUtilizationPercentage),
        });
      }
    }

    summaries.sort((a, b) => a.avgUtilization - b.avgUtilization);
    const totalWaste = summaries.reduce((s, i) => s + i.estimatedWastedCost, 0);

    res.json({
      underutilized: summaries,
      count: summaries.length,
      totalEstimatedWaste: Math.round(totalWaste * 100) / 100,
      _temporal: buildTemporalMeta({ scope, billingStart: period.start, billingEnd: period.end, apiVersion: '2021-10-01' }),
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

function getUnderutilizedRecommendation(utilPct) {
  if (utilPct < 20) return 'EXCHANGE: Utilization critically low. Exchange for a smaller SKU or return.';
  if (utilPct < 50) return 'RESIZE: Consider exchanging for fewer units or a smaller SKU.';
  if (utilPct < 70) return 'INVESTIGATE: Check if workloads were scaled down or migrated away.';
  return 'MONITOR: Slightly below threshold. Review next billing cycle.';
}

function recentDays(n) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - n);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

export default router;
