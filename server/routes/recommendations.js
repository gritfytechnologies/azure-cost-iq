/**
 * server/routes/recommendations.js
 * RI purchase recommendations + Azure Savings Plan recommendations.
 *
 * GET /api/recommendations/ri       — where to buy new RIs (Azure Advisor)
 * GET /api/recommendations/csp      — Azure Compute Savings Plan recommendations
 * GET /api/recommendations/all      — combined RI + CSP + cost optimization
 *
 * Data source: Azure Advisor (Cost category) + Consumption RI recommendation APIs.
 */

import { Router } from 'express';
import armAdvisor from '@azure/arm-advisor';
import armConsumption from '@azure/arm-consumption';
const { AdvisorManagementClient } = armAdvisor;
const { ConsumptionManagementClient } = armConsumption;
import { getCredential } from '../auth.js';
import { buildTemporalMeta } from '../middleware/temporal.js';

const router = Router();

const TERM_LABELS = { P1Y: '1 Year', P3Y: '3 Years' };
const SCOPE_LABELS = { Shared: 'Shared (all subs)', Single: 'Single subscription' };

function getScope(req) {
  return req.query.scope || process.env.DEFAULT_SCOPE;
}

/**
 * GET /api/recommendations/ri
 * Azure Advisor RI purchase recommendations, enriched with savings data.
 */
router.get('/ri', async (req, res) => {
  const scope = getScope(req);
  if (!scope) return res.status(400).json({ error: 'scope query parameter required' });

  try {
    const cred = getCredential();

    // Advisor cost recommendations
    const advisorClient = new AdvisorManagementClient(cred, extractSubId(scope));
    const riRecs = [];

    for await (const rec of advisorClient.recommendations.list({ $filter: "Category eq 'Cost'" })) {
      const props = rec.properties || {};
      const shortDesc = (props.shortDescription?.solution || '').toLowerCase();
      if (!shortDesc.includes('reservation') && !shortDesc.includes('reserved instance')) continue;

      const extProps = props.extendedProperties || {};
      const annualSavingsUSD = parseFloat(extProps.annualSavingsAmount || extProps.savingsAmount || '0');
      const currentCostMonthly = parseFloat(extProps.currentCost || extProps.onDemandCost || '0');
      const riCostMonthly = parseFloat(extProps.reservationCost || extProps.reservedInstanceCost || '0');

      riRecs.push({
        recommendationId: rec.name,
        resourceType: props.impactedField || 'Unknown',
        sku: extProps.sku || extProps.displaySku || props.impactedValue,
        region: extProps.region || extProps.location || 'Unknown',
        lookbackPeriod: extProps.lookbackPeriod || 'Last30Days',
        term: extProps.term,
        termLabel: TERM_LABELS[extProps.term] || extProps.term || '1 Year',
        recommendedQuantity: parseInt(extProps.recommendedQuantityNormalized || extProps.recommendedQuantity || '1', 10),
        currentCostMonthly: Math.round(currentCostMonthly * 100) / 100,
        riCostMonthly: Math.round(riCostMonthly * 100) / 100,
        monthlySavings: Math.round((currentCostMonthly - riCostMonthly) * 100) / 100,
        annualSavingsUSD: Math.round(annualSavingsUSD * 100) / 100,
        savingsPct: currentCostMonthly > 0 ? Math.round(((currentCostMonthly - riCostMonthly) / currentCostMonthly) * 100) : 0,
        recommendedScope: extProps.scope || 'Shared',
        recommendedScopeLabel: SCOPE_LABELS[extProps.scope] || extProps.scope || 'Shared',
        impact: props.impact,
        resourceGroupList: extProps.resourceGroupName ? [extProps.resourceGroupName] : [],
        lastUpdated: rec.lastUpdated,
        action: buildRIAction(extProps),
      });
    }

    riRecs.sort((a, b) => b.annualSavingsUSD - a.annualSavingsUSD);
    const totalAnnualSavings = riRecs.reduce((s, r) => s + r.annualSavingsUSD, 0);

    res.json({
      recommendations: riRecs,
      count: riRecs.length,
      totalPotentialAnnualSavings: Math.round(totalAnnualSavings * 100) / 100,
      summary: buildRISummary(riRecs),
      _temporal: buildTemporalMeta({
        scope,
        apiVersion: '2023-01-01',
      }),
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * GET /api/recommendations/csp
 * Azure Compute Savings Plan recommendations via Consumption API.
 */
router.get('/csp', async (req, res) => {
  const scope = getScope(req);
  if (!scope) return res.status(400).json({ error: 'scope query parameter required' });
  const term = req.query.term || 'P1Y';
  const lookback = req.query.lookback || 'Last30Days';

  try {
    const cred = getCredential();
    const client = new ConsumptionManagementClient(cred);
    const recs = [];

    // Savings plan recommendations via Consumption API
    try {
      const filter = `properties/term eq '${term}' and properties/lookBackPeriod eq '${lookback}'`;
      for await (const rec of client.benefitRecommendations.list(scope, { filter })) {
        const props = rec.properties || {};
        recs.push({
          kind: rec.kind || 'savingsplan',
          term: props.term,
          termLabel: TERM_LABELS[props.term] || props.term || '1 Year',
          lookBackPeriod: props.lookBackPeriod || lookback,
          scope: props.scope,
          commitmentAmount: props.commitmentAmount
            ? Math.round(props.commitmentAmount.amount * 100) / 100
            : null,
          currency: props.commitmentAmount?.currencyCode || 'USD',
          annualSavingsPercent: props.savingsPercent
            ? Math.round(props.savingsPercent * 10) / 10
            : null,
          totalCostWithBenefit: props.totalCostWithBenefit
            ? Math.round(props.totalCostWithBenefit * 100) / 100
            : null,
          allSavingsList: (props.allSavingsList || []).map(s => ({
            term: TERM_LABELS[s.term] || s.term,
            savingsPct: Math.round((s.savingsPercent || 0) * 10) / 10,
            commitmentAmount: s.commitmentAmount ? Math.round(s.commitmentAmount.amount * 100) / 100 : null,
          })),
        });
      }
    } catch (e) {
      // CSP recommendations may not be available for all account types
    }

    res.json({
      recommendations: recs,
      count: recs.length,
      term: TERM_LABELS[term] || term,
      lookback,
      note: recs.length === 0
        ? 'No CSP recommendations available. Requires at least 30 days of compute usage history and MCA/EA billing account.'
        : null,
      _temporal: buildTemporalMeta({ scope, apiVersion: '2023-11-01' }),
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * GET /api/recommendations/all
 * Combined: RI + CSP + Advisor cost optimizations (idle VMs, orphaned disks, right-sizing).
 */
router.get('/all', async (req, res) => {
  const scope = getScope(req);
  if (!scope) return res.status(400).json({ error: 'scope query parameter required' });

  try {
    const cred = getCredential();
    const advisorClient = new AdvisorManagementClient(cred, extractSubId(scope));
    const allRecs = [];

    for await (const rec of advisorClient.recommendations.list({ $filter: "Category eq 'Cost'" })) {
      const props = rec.properties || {};
      const extProps = props.extendedProperties || {};
      const annualSavings = parseFloat(extProps.annualSavingsAmount || extProps.savingsAmount || '0');

      allRecs.push({
        id: rec.name,
        category: 'Cost',
        impact: props.impact || 'Medium',
        shortDescription: props.shortDescription?.solution || props.shortDescription?.problem || 'Cost optimization',
        resourceType: props.impactedField,
        resourceId: props.resourceMetadata?.resourceId || props.impactedValue,
        annualSavingsUSD: Math.round(annualSavings * 100) / 100,
        type: classifyRecommendationType(props.shortDescription?.solution || ''),
        lastUpdated: rec.lastUpdated,
        remediation: props.remediation?.actionUrl
          ? `${props.remediation.actionUrlText || 'View in Azure Portal'}: ${props.remediation.actionUrl}`
          : null,
      });
    }

    // Sort by annual savings descending
    allRecs.sort((a, b) => b.annualSavingsUSD - a.annualSavingsUSD);
    const totalPotential = allRecs.reduce((s, r) => s + r.annualSavingsUSD, 0);

    const byType = allRecs.reduce((acc, r) => {
      acc[r.type] = (acc[r.type] || 0) + r.annualSavingsUSD;
      return acc;
    }, {});

    res.json({
      recommendations: allRecs,
      count: allRecs.length,
      totalPotentialAnnualSavings: Math.round(totalPotential * 100) / 100,
      byType,
      topOpportunities: allRecs.slice(0, 5),
      _temporal: buildTemporalMeta({ scope, apiVersion: '2023-01-01' }),
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractSubId(scope) {
  const match = scope.match(/subscriptions\/([^/]+)/);
  return match ? match[1] : undefined;
}

function classifyRecommendationType(solution) {
  const s = (solution || '').toLowerCase();
  if (s.includes('reservation') || s.includes('reserved instance')) return 'Reserved Instance';
  if (s.includes('savings plan')) return 'Savings Plan';
  if (s.includes('idle') || s.includes('unused') || s.includes('deallocate')) return 'Idle Resource';
  if (s.includes('right-siz') || s.includes('resize') || s.includes('underutil')) return 'Right-sizing';
  if (s.includes('disk') || s.includes('snapshot')) return 'Storage';
  if (s.includes('public ip') || s.includes('ip address')) return 'Networking';
  if (s.includes('app service') || s.includes('web app')) return 'App Service';
  return 'Other';
}

function buildRIAction(extProps) {
  const term = TERM_LABELS[extProps.term] || '1 Year';
  const qty = extProps.recommendedQuantityNormalized || extProps.recommendedQuantity || '1';
  const sku = extProps.sku || extProps.displaySku || 'this SKU';
  return `Purchase ${qty} × ${sku} reservation for ${term} in Azure Portal → Reservations → Add.`;
}

function buildRISummary(recs) {
  return {
    byServiceType: recs.reduce((acc, r) => {
      const t = r.resourceType || 'Other';
      if (!acc[t]) acc[t] = { count: 0, annualSavings: 0 };
      acc[t].count++;
      acc[t].annualSavings += r.annualSavingsUSD;
      return acc;
    }, {}),
    byRegion: recs.reduce((acc, r) => {
      const reg = r.region || 'Unknown';
      acc[reg] = (acc[reg] || 0) + r.annualSavingsUSD;
      return acc;
    }, {}),
    highImpact: recs.filter(r => (r.impact || '').toLowerCase() === 'high').length,
  };
}

export default router;
