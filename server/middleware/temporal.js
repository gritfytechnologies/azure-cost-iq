/**
 * server/middleware/temporal.js
 * Temporal Source Attribution for AzureCostIQ.
 *
 * Azure billing data has well-known retroactive mutation issues:
 *   - Invoice amendments up to 72h after period close
 *   - RI/Savings Plan amortization recalculated retroactively
 *   - Cost Management export lag: 24-48h typical
 *   - EA/MCA credit adjustments: variable, can be weeks
 *   - Marketplace charges: up to 7 days delay
 *
 * Every API response is wrapped with this metadata so dashboards can
 * display "as of" timestamps and explain why numbers may change.
 */

const BILLING_DELAYS = {
  currentPeriod: {
    description: 'Current billing period — data is PRELIMINARY',
    exportLag: '24-48 hours',
    amendmentWindow: 'N/A (period open)',
    vintage: 'PRELIMINARY',
  },
  recentClosed: {
    description: 'Period closed within 72h — may still be amended',
    exportLag: '0-72 hours post-close',
    amendmentWindow: '72 hours after period close',
    vintage: 'PENDING_FINAL',
  },
  final: {
    description: 'Period closed >72h ago — considered final',
    exportLag: 'Complete',
    amendmentWindow: 'Complete (except EA credit adjustments)',
    vintage: 'FINAL',
  },
};

/**
 * Determine data vintage based on billing period dates.
 */
function classifyVintage(periodEndDate) {
  if (!periodEndDate) return BILLING_DELAYS.currentPeriod;
  const end = new Date(periodEndDate);
  const now = new Date();
  const hoursSinceClose = (now - end) / (1000 * 60 * 60);

  if (end > now) return BILLING_DELAYS.currentPeriod;
  if (hoursSinceClose < 72) return BILLING_DELAYS.recentClosed;
  return BILLING_DELAYS.final;
}

/**
 * Build the temporal attribution block attached to every API response.
 *
 * @param {object} opts
 * @param {string} opts.scope          - Azure scope URI (MG / subscription / tenant)
 * @param {string} opts.billingStart   - ISO date string e.g. '2026-05-01'
 * @param {string} opts.billingEnd     - ISO date string e.g. '2026-05-31'
 * @param {string} opts.apiVersion     - Azure API version used
 * @param {string} [opts.exportDate]   - When the underlying export was generated (if known)
 */
export function buildTemporalMeta({ scope, billingStart, billingEnd, apiVersion, exportDate } = {}) {
  const now = new Date();
  const vintage = classifyVintage(billingEnd);

  return {
    requestedAt: now.toISOString(),
    billingPeriod: {
      start: billingStart || null,
      end: billingEnd || null,
      status: vintage.vintage,
    },
    sourceExportDate: exportDate || null,
    ingestionTimestamp: now.toISOString(),
    dataVintage: vintage.vintage,
    apiVersion: apiVersion || '2023-11-01',
    scope: scope || null,
    staleness: vintage.exportLag,
    warnings: buildWarnings(vintage, billingEnd),
    knownDelays: {
      costManagementExport: '24-48 hours behind real-time spend',
      riAmortizationRecalc: 'Up to 48h after period close',
      marketplaceCharges: 'Up to 7 days delay',
      creditAdjustments: 'Variable — check Azure portal for EA/MCA',
      invoiceAmendments: '72h window after billing period close',
    },
  };
}

function buildWarnings(vintage, billingEnd) {
  const warnings = [];

  if (vintage.vintage === 'PRELIMINARY') {
    warnings.push('Current period spend is 24-48h behind actual consumption');
    warnings.push('Numbers will change as billing pipeline processes usage data');
  }

  if (vintage.vintage === 'PENDING_FINAL') {
    warnings.push('Period recently closed — amendments may still arrive for up to 72h');
    warnings.push('RI/Savings Plan amortization may be recalculated');
  }

  if (vintage.vintage === 'FINAL') {
    warnings.push('EA/MCA credit adjustments may still apply regardless of period closure');
  }

  return warnings;
}

/**
 * Express middleware that intercepts res.json() to inject temporal attribution.
 * Routes opt-in by calling res.locals.temporalOpts = { scope, billingStart, ... }
 */
export function temporalAttributionMiddleware(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function (body) {
    if (res.locals.temporalOpts && body && typeof body === 'object' && !body._temporal) {
      body._temporal = buildTemporalMeta(res.locals.temporalOpts);
    }
    return originalJson(body);
  };

  next();
}
