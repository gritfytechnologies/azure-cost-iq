/**
 * LiveAnalysis.jsx — AzureCostIQ Live Analyzer
 *
 * Connects to the Express backend (/api/*) which calls Azure APIs with the
 * configured Service Principal or Managed Identity.
 *
 * Tabs:
 *   Overview        — Executive KPIs, MoM trend, top cost drivers
 *   Reservations    — All RIs: usage, savings, expiring, underutilized
 *   RI Buy Guide    — Where to buy new RIs (Advisor recommendations)
 *   Savings Plans   — Azure Compute Savings Plan analysis
 *   FinOps Detail   — Cost by service, RG, tag, subscription, budgets
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── Colour palette ───────────────────────────────────────────────────────────
const C = {
  blue:   '#0078D4', navy:  '#0F2A47', teal:  '#00897B',
  green:  '#2E7D32', amber: '#F57C00', red:   '#C62828',
  purple: '#6A1B9A', gray:  '#546E7A', light: '#F5F7FA',
  border: '#E5E7EB', text:  '#111827', muted: '#6B7280',
};

const CAD_RATE = 1.38;

// ─── Tiny utilities ───────────────────────────────────────────────────────────
const fmtCAD = (v) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format((v || 0) * CAD_RATE);
const fmtUSD = (v) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v || 0);
const fmtPct = (v) => `${(v || 0).toFixed(1)}%`;
const pluralize = (n, s) => `${n} ${s}${n !== 1 ? 's' : ''}`;

// ─── Shared components ────────────────────────────────────────────────────────

function Card({ children, style = {} }) {
  return (
    <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px', ...style }}>
      {children}
    </div>
  );
}

function KPICard({ label, value, sub, delta, color, icon }) {
  const isPos = delta !== null && delta !== undefined && delta > 0;
  const isNeg = delta !== null && delta !== undefined && delta < 0;
  return (
    <Card style={{ flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{icon} {label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || C.text, lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</div>}
      {delta !== null && delta !== undefined && (
        <div style={{ fontSize: 11, marginTop: 4, color: isPos ? C.red : isNeg ? C.green : C.muted, fontWeight: 600 }}>
          {isPos ? '▲' : isNeg ? '▼' : '—'} {Math.abs(delta).toFixed(1)}% vs prior month
        </div>
      )}
    </Card>
  );
}

function Badge({ label, color = C.blue }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, background: color + '20', color, border: `1px solid ${color}40`, padding: '1px 7px', borderRadius: 10, letterSpacing: '.04em' }}>
      {label}
    </span>
  );
}

function ProgressBar({ value, max, color = C.blue, height = 6 }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const barColor = pct >= 80 ? C.green : pct >= 50 ? C.amber : C.red;
  return (
    <div style={{ height, background: C.border, borderRadius: height, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color || barColor, borderRadius: height, transition: 'width .4s ease' }} />
    </div>
  );
}

function Alert({ children, type = 'info' }) {
  const styles = {
    info:    { bg: '#EFF6FF', border: C.blue,   text: '#1D4ED8' },
    warning: { bg: '#FFFBEB', border: C.amber,  text: '#92400E' },
    error:   { bg: '#FEF2F2', border: C.red,    text: '#991B1B' },
    success: { bg: '#F0FDF4', border: C.green,  text: '#166534' },
  };
  const s = styles[type] || styles.info;
  return (
    <div style={{ fontSize: 12, lineHeight: 1.6, padding: '9px 12px', borderRadius: 7, borderLeft: `3px solid ${s.border}`, background: s.bg, color: s.text, marginBottom: 10 }}>
      {children}
    </div>
  );
}

function SectionHeader({ title, sub, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12, marginTop: 20 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</div>}
      </div>
      {action}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, color: C.muted, gap: 10, fontSize: 13 }}>
      <div style={{ width: 18, height: 18, border: `2px solid ${C.border}`, borderTop: `2px solid ${C.blue}`, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      Loading from Azure…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function EmptyState({ icon = '📭', title, sub }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: C.muted }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>{title}</div>
      {sub && <div style={{ fontSize: 12 }}>{sub}</div>}
    </div>
  );
}

function TemporalBadge({ temporal }) {
  if (!temporal) return null;
  const vintage = temporal.dataVintage;
  const color = vintage === 'FINAL' ? C.green : vintage === 'PRELIMINARY' ? C.amber : C.red;
  const label = vintage === 'FINAL' ? 'Final' : vintage === 'PRELIMINARY' ? 'Preliminary' : vintage;
  const age = temporal.requestedAt ? new Date(temporal.requestedAt).toLocaleTimeString('en-CA') : '';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <Badge label={`Data: ${label}`} color={color} />
      <span style={{ fontSize: 10, color: C.muted }}>Fetched {age} · API {temporal.apiVersion}</span>
      {(temporal.warnings || []).slice(0, 1).map((w, i) => (
        <span key={i} style={{ fontSize: 10, color: C.amber }}>⚠ {w}</span>
      ))}
    </div>
  );
}

// ─── API hook ─────────────────────────────────────────────────────────────────

function useApi(url, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch_ = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(url);
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${r.status}`);
      }
      const d = await r.json();
      setData(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => { fetch_(); }, [fetch_, ...deps]);

  return { data, loading, error, refetch: fetch_ };
}

// ─── Scope selector ───────────────────────────────────────────────────────────

function ScopeSelector({ scope, onScopeChange }) {
  const { data, loading, error } = useApi('/api/scope/options');

  if (loading) return <div style={{ padding: '8px 12px', fontSize: 12, color: C.muted }}>Discovering scopes…</div>;

  if (error) {
    return (
      <Alert type="error">
        <strong>Azure connection failed:</strong> {error}
        <br />Ensure AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET are set and the SP has Cost Management Reader + Reservations Reader roles.
      </Alert>
    );
  }

  const scopes = data?.scopes || [];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'white', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, whiteSpace: 'nowrap' }}>Analysis scope:</div>
      <select
        value={scope}
        onChange={e => onScopeChange(e.target.value)}
        style={{ fontSize: 13, padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.light, cursor: 'pointer', fontFamily: 'inherit', flex: 1, minWidth: 200 }}
      >
        <option value="">— Select scope —</option>
        {scopes.map(s => (
          <option key={s.scope} value={s.scope}>
            {s.type === 'tenant-root' ? '🌐' : s.type === 'management-group' ? '📂' : '📋'} {s.displayName}
            {s.type === 'subscription' ? ` (${s.id})` : ''}
          </option>
        ))}
      </select>
      {scopes.length > 0 && (
        <span style={{ fontSize: 10, color: C.muted }}>{pluralize(scopes.length, 'scope')} available</span>
      )}
    </div>
  );
}

// ─── TAB: Overview (Executive) ────────────────────────────────────────────────

function OverviewTab({ scope }) {
  const summaryUrl = scope ? `/api/costs/summary?scope=${encodeURIComponent(scope)}` : null;
  const trendUrl   = scope ? `/api/costs/trend?scope=${encodeURIComponent(scope)}&months=6` : null;
  const serviceUrl = scope ? `/api/costs/by-service?scope=${encodeURIComponent(scope)}` : null;
  const savingsUrl = scope ? `/api/reservations/savings?scope=${encodeURIComponent(scope)}` : null;

  const summary  = useApi(summaryUrl);
  const trend    = useApi(trendUrl);
  const services = useApi(serviceUrl);
  const savings  = useApi(savingsUrl);

  if (!scope) return <EmptyState icon="🔭" title="Select a scope to begin" sub="Choose a Management Group, Subscription, or Tenant from the scope selector above" />;

  return (
    <div>
      {/* KPI cards */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        {summary.loading ? <Spinner /> : summary.error ? (
          <Alert type="error">Cost data unavailable: {summary.error}</Alert>
        ) : (
          <>
            <KPICard icon="💰" label="MTD Spend" value={fmtCAD(summary.data?.currentPeriod?.totalCost)} sub={`USD ${fmtUSD(summary.data?.currentPeriod?.totalCost)}`} delta={summary.data?.momChangePercent} color={C.navy} />
            <KPICard icon="📅" label="Prior Month" value={fmtCAD(summary.data?.priorPeriod?.totalCost)} sub="Final" color={C.gray} />
            <KPICard icon="📈" label="Annual Run Rate" value={fmtCAD(summary.data?.annualRunRate)} sub="Based on MTD pace" color={C.blue} />
            <KPICard icon="💎" label="RI Savings MTD" value={fmtCAD(savings.data?.summary?.currentMonthSaving)} sub={savings.data?.summary ? `${savings.data.summary.savingPercent}% vs PAYG` : 'Loading…'} color={C.green} />
          </>
        )}
      </div>

      {/* Temporal metadata */}
      {summary.data?._temporal && (
        <div style={{ marginBottom: 12 }}>
          <TemporalBadge temporal={summary.data._temporal} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Cost trend chart */}
        <Card>
          <SectionHeader title="6-Month Cost Trend" sub="Actual spend by billing period" />
          {trend.loading ? <Spinner /> : trend.error ? (
            <Alert type="error">{trend.error}</Alert>
          ) : (
            <TrendBars trend={trend.data?.trend || []} />
          )}
        </Card>

        {/* Top services */}
        <Card>
          <SectionHeader title="Top Cost Drivers" sub="Current month, by Azure service" />
          {services.loading ? <Spinner /> : services.error ? (
            <Alert type="error">{services.error}</Alert>
          ) : (
            <ServiceList services={(services.data?.services || []).slice(0, 8)} />
          )}
        </Card>
      </div>

      {/* RI savings summary */}
      {savings.data?.summary && (
        <Card style={{ marginTop: 14 }}>
          <SectionHeader title="Reserved Instance Savings Summary" sub="This billing period" />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <KPICard icon="💵" label="PAYG Equivalent" value={fmtUSD(savings.data.summary.currentMonthPaygEquivalent)} sub="What you'd pay without RIs" />
            <KPICard icon="💳" label="RI Cost" value={fmtUSD(savings.data.summary.currentMonthAmortizedCost)} sub="Amortized reservation cost" />
            <KPICard icon="🏆" label="Total Saving" value={fmtUSD(savings.data.summary.currentMonthSaving)} sub={`${savings.data.summary.savingPercent}% off PAYG`} color={C.green} />
            <KPICard icon="🔮" label="Projected Annual" value={fmtUSD(savings.data.summary.projectedAnnualSaving)} sub="At current utilization" color={C.teal} />
          </div>
        </Card>
      )}
    </div>
  );
}

function TrendBars({ trend }) {
  if (!trend.length) return <EmptyState icon="📊" title="No trend data" sub="Ensure Cost Management is enabled on this scope" />;
  const max = Math.max(...trend.map(m => m.cost), 1);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
      {trend.map((m) => {
        const h = Math.max(4, (m.cost / max) * 100);
        return (
          <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ fontSize: 9, color: C.muted }}>{fmtCAD(m.cost).replace('CA$', '')}</div>
            <div
              title={`${m.month}: ${fmtCAD(m.cost)}`}
              style={{ width: '100%', height: `${h}px`, background: m.status === 'PRELIMINARY' ? C.amber : C.blue, borderRadius: '4px 4px 0 0', opacity: m.status === 'PRELIMINARY' ? 0.75 : 1 }}
            />
            <div style={{ fontSize: 9, color: C.muted, textAlign: 'center', lineHeight: 1.2 }}>
              {m.month.slice(5)}{m.status === 'PRELIMINARY' ? '*' : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ServiceList({ services }) {
  if (!services.length) return <EmptyState icon="🔍" title="No service data" />;
  const max = services[0]?.cost || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {services.map(s => (
        <div key={s.service}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{s.service}</span>
            <span style={{ fontSize: 12, color: C.muted }}>{fmtCAD(s.cost)} ({s.pctOfTotal}%)</span>
          </div>
          <ProgressBar value={s.cost} max={max} color={C.blue} />
        </div>
      ))}
    </div>
  );
}

// ─── TAB: Reservations ────────────────────────────────────────────────────────

function ReservationsTab({ scope }) {
  const [subTab, setSubTab] = useState('list');
  const listUrl  = `/api/reservations`;
  const usageUrl = scope ? `/api/reservations/usage?scope=${encodeURIComponent(scope)}` : null;
  const expiryUrl = `/api/reservations/expiring?days=90`;
  const underUrl = scope ? `/api/reservations/underutilized?scope=${encodeURIComponent(scope)}` : null;

  const list    = useApi(listUrl);
  const usage   = useApi(usageUrl);
  const expiry  = useApi(expiryUrl);
  const under   = useApi(underUrl);

  if (!scope) return <EmptyState icon="💎" title="Select a scope" sub="Reservation usage data requires a scope" />;

  const SUB_TABS = [
    { id: 'list', label: `All RIs (${list.data?.summary?.totalReservations || 0})` },
    { id: 'usage', label: 'Utilization' },
    { id: 'expiring', label: `Expiring (${expiry.data?.count || 0})` },
    { id: 'underutilized', label: `Underutilized (${under.data?.count || 0})` },
  ];

  return (
    <div>
      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: `1px solid ${C.border}`, paddingBottom: 0 }}>
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)} style={{
            padding: '6px 14px', border: 'none', borderBottom: subTab === t.id ? `2px solid ${C.blue}` : '2px solid transparent',
            background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: subTab === t.id ? 600 : 400,
            color: subTab === t.id ? C.blue : C.muted, fontFamily: 'inherit',
          }}>{t.label}</button>
        ))}
      </div>

      {subTab === 'list'          && <RIList data={list.data} loading={list.loading} error={list.error} />}
      {subTab === 'usage'         && <RIUsage data={usage.data} loading={usage.loading} error={usage.error} />}
      {subTab === 'expiring'      && <RIExpiring data={expiry.data} loading={expiry.loading} error={expiry.error} />}
      {subTab === 'underutilized' && <RIUnderutilized data={under.data} loading={under.loading} error={under.error} />}
    </div>
  );
}

function RIList({ data, loading, error }) {
  if (loading) return <Spinner />;
  if (error)   return <Alert type="error">{error}</Alert>;
  if (!data)   return null;

  const orders = data.orders || [];
  if (!orders.length) return <EmptyState icon="💎" title="No reservations found" sub="No reservation orders visible to this credential" />;

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <KPICard icon="📦" label="Total Orders" value={data.summary.totalOrders} />
        <KPICard icon="🔖" label="Total Reservations" value={data.summary.totalReservations} />
        <KPICard icon="⏰" label="Expiring in 90d" value={data.summary.expiringIn90Days} color={data.summary.expiringIn90Days > 0 ? C.amber : C.green} />
      </div>

      <TemporalBadge temporal={data._temporal} />
      <div style={{ height: 10 }} />

      {orders.map(order => (
        <Card key={order.orderId} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{order.displayName}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                {order.serviceTypeLabel} · {order.termLabel} · Qty {order.originalQuantity}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <Badge label={order.provisioningState} color={order.provisioningState === 'Succeeded' ? C.green : C.amber} />
              <Badge label={`${order.reservationCount} res`} color={C.blue} />
              {order.daysUntilExpiry !== null && order.daysUntilExpiry <= 90 && (
                <Badge label={`Expires in ${order.daysUntilExpiry}d`} color={order.daysUntilExpiry <= 30 ? C.red : C.amber} />
              )}
            </div>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
            Purchased {order.purchaseDate ? new Date(order.purchaseDate).toLocaleDateString('en-CA') : '—'} ·
            Expires {order.expiryDate ? new Date(order.expiryDate).toLocaleDateString('en-CA') : '—'} ·
            Order ID: {order.orderId}
          </div>
        </Card>
      ))}
    </div>
  );
}

function RIUsage({ data, loading, error }) {
  if (loading) return <Spinner />;
  if (error)   return <Alert type="error">{error}</Alert>;
  if (!data?.usage?.length) return <EmptyState icon="📊" title="No utilization data" sub="Ensure reservation summaries are available for this scope" />;

  return (
    <div>
      <TemporalBadge temporal={data._temporal} />
      <div style={{ height: 10 }} />
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: C.light, textAlign: 'left' }}>
            {['SKU', 'Reserved Hrs', 'Used Hrs', 'Unused Hrs', 'Utilization', 'Status'].map(h => (
              <th key={h} style={{ padding: '8px 10px', fontSize: 11, color: C.muted, fontWeight: 600, borderBottom: `1px solid ${C.border}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.usage.map((u, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: '8px 10px', fontWeight: 500 }}>{u.skuName || '—'}</td>
              <td style={{ padding: '8px 10px', color: C.muted }}>{Math.round(u.reservedHours || 0).toLocaleString()}</td>
              <td style={{ padding: '8px 10px', color: C.muted }}>{Math.round(u.usedHours || 0).toLocaleString()}</td>
              <td style={{ padding: '8px 10px', color: C.red }}>{Math.round((u.reservedHours || 0) - (u.usedHours || 0)).toLocaleString()}</td>
              <td style={{ padding: '8px 10px', width: 140 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ProgressBar value={u.utilizationPct} max={100} color={u.utilizationPct >= 80 ? C.green : u.utilizationPct >= 50 ? C.amber : C.red} height={5} />
                  <span style={{ fontWeight: 600, color: u.utilizationPct >= 80 ? C.green : u.utilizationPct >= 50 ? C.amber : C.red }}>
                    {fmtPct(u.utilizationPct)}
                  </span>
                </div>
              </td>
              <td style={{ padding: '8px 10px' }}>
                <Badge label={u.utilizationPct >= 80 ? 'Healthy' : u.utilizationPct >= 50 ? 'At Risk' : 'Low'} color={u.utilizationPct >= 80 ? C.green : u.utilizationPct >= 50 ? C.amber : C.red} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RIExpiring({ data, loading, error }) {
  if (loading) return <Spinner />;
  if (error)   return <Alert type="error">{error}</Alert>;
  if (!data?.expiring?.length) return <EmptyState icon="✅" title="No reservations expiring soon" sub="No RI orders expiring within 90 days" />;

  return (
    <div>
      <Alert type="warning">
        <strong>{data.count} reservation{data.count !== 1 ? 's' : ''} expiring within 90 days.</strong> Renew before expiry to avoid PAYG pricing gap. Azure allows renewal up to 30 days before expiry.
      </Alert>
      {data.expiring.map((r, i) => (
        <Card key={i} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{r.displayName}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{r.serviceType} · {r.term} · Qty {r.quantity}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Badge label={`${r.daysUntilExpiry}d left`} color={r.urgency === 'HIGH' ? C.red : r.urgency === 'MEDIUM' ? C.amber : C.gray} />
              <Badge label={r.urgency} color={r.urgency === 'HIGH' ? C.red : r.urgency === 'MEDIUM' ? C.amber : C.gray} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
            Expiry: {new Date(r.expiryDate).toLocaleDateString('en-CA')} · {r.action}
          </div>
        </Card>
      ))}
    </div>
  );
}

function RIUnderutilized({ data, loading, error }) {
  if (loading) return <Spinner />;
  if (error)   return <Alert type="error">{error}</Alert>;
  if (!data?.underutilized?.length) return <EmptyState icon="✅" title="All reservations above threshold" sub="No reservations below 80% utilization this period" />;

  return (
    <div>
      <Alert type="warning">
        <strong>Estimated waste: {fmtUSD(data.totalEstimatedWaste)}/month</strong> from {data.count} underutilized reservation{data.count !== 1 ? 's' : ''}.
        Consider exchange, right-sizing, or returning unused capacity.
      </Alert>
      <TemporalBadge temporal={data._temporal} />
      <div style={{ height: 10 }} />
      {data.underutilized.map((u, i) => (
        <Card key={i} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{u.skuName}</div>
            <Badge label={`${fmtPct(u.avgUtilization)} util`} color={u.avgUtilization < 20 ? C.red : C.amber} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 8, fontSize: 11, color: C.muted }}>
            <div>Reserved: {Math.round(u.reservedHours || 0).toLocaleString()} hrs</div>
            <div>Used: {Math.round(u.usedHours || 0).toLocaleString()} hrs</div>
            <div style={{ color: C.red }}>Wasted: ~{fmtUSD(u.estimatedWastedCost)}/mo</div>
          </div>
          <div style={{ marginTop: 6 }}>
            <ProgressBar value={u.avgUtilization} max={100} color={u.avgUtilization < 20 ? C.red : C.amber} height={5} />
          </div>
          <div style={{ fontSize: 11, color: C.text, marginTop: 6, fontStyle: 'italic' }}>{u.recommendation}</div>
        </Card>
      ))}
    </div>
  );
}

// ─── TAB: RI Buy Guide ────────────────────────────────────────────────────────

function RIBuyGuideTab({ scope }) {
  const [term, setTerm] = useState('P1Y');
  const url = scope ? `/api/recommendations/ri?scope=${encodeURIComponent(scope)}&term=${term}` : null;
  const { data, loading, error } = useApi(url, [term]);

  if (!scope) return <EmptyState icon="🎯" title="Select a scope" sub="RI recommendations require a scope" />;

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: C.muted }}>Term:</span>
        {['P1Y', 'P3Y'].map(t => (
          <button key={t} onClick={() => setTerm(t)} style={{
            padding: '5px 14px', borderRadius: 20, border: `1px solid ${t === term ? C.blue : C.border}`,
            background: t === term ? C.blue : 'white', color: t === term ? 'white' : C.text,
            fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          }}>{t === 'P1Y' ? '1 Year (~30% savings)' : '3 Years (~60% savings)'}</button>
        ))}
      </div>

      {loading ? <Spinner /> : error ? (
        <Alert type="error">{error}</Alert>
      ) : !data?.recommendations?.length ? (
        <EmptyState icon="✅" title="No RI recommendations" sub="Azure Advisor has no current RI purchase recommendations for this scope. This may mean existing coverage is already optimal." />
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <KPICard icon="🎯" label="Recommendations" value={data.count} />
            <KPICard icon="💰" label="Potential Annual Savings" value={fmtCAD(data.totalPotentialAnnualSavings)} sub="USD base, converted" color={C.green} />
            <KPICard icon="📊" label="High Impact" value={data.summary?.highImpact || 0} color={data.summary?.highImpact > 0 ? C.red : C.green} />
          </div>

          <TemporalBadge temporal={data._temporal} />
          <div style={{ height: 10 }} />

          {data.recommendations.map((r, i) => (
            <Card key={i} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{r.sku || r.resourceType}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    {r.region} · {r.termLabel} · {r.recommendedScopeLabel} · Qty {r.recommendedQuantity}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: C.green, fontSize: 15 }}>{fmtCAD(r.annualSavingsUSD)}/yr</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{r.savingsPct}% savings</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10, fontSize: 11 }}>
                <div style={{ background: C.light, borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ color: C.muted }}>Current PAYG/mo</div>
                  <div style={{ fontWeight: 600, color: C.red }}>{fmtUSD(r.currentCostMonthly)}</div>
                </div>
                <div style={{ background: C.light, borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ color: C.muted }}>RI Cost/mo</div>
                  <div style={{ fontWeight: 600, color: C.blue }}>{fmtUSD(r.riCostMonthly)}</div>
                </div>
                <div style={{ background: '#F0FDF4', borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ color: C.muted }}>Monthly Saving</div>
                  <div style={{ fontWeight: 600, color: C.green }}>{fmtUSD(r.monthlySavings)}</div>
                </div>
              </div>

              <Alert type="info" style={{ marginTop: 8, marginBottom: 0 }}>
                <strong>Action:</strong> {r.action}
              </Alert>
              {r.impact === 'High' && <Badge label="HIGH IMPACT" color={C.red} />}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── TAB: Savings Plans ───────────────────────────────────────────────────────

function SavingsPlansTab({ scope }) {
  const [term, setTerm] = useState('P1Y');
  const url = scope ? `/api/recommendations/csp?scope=${encodeURIComponent(scope)}&term=${term}` : null;
  const { data, loading, error } = useApi(url, [term]);

  if (!scope) return <EmptyState icon="📋" title="Select a scope" sub="Savings Plan recommendations require a scope" />;

  return (
    <div>
      <Alert type="info">
        <strong>Azure Compute Savings Plans</strong> offer 1-year or 3-year commitments to a specific hourly spend amount (in USD), covering VMs, VMSS, AKS, Azure Functions (Premium/Dedicated), and App Service (Isolated/Premium). Unlike RIs, savings plans apply across regions and SKUs automatically.
      </Alert>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '14px 0' }}>
        <span style={{ fontSize: 12, color: C.muted }}>Term:</span>
        {['P1Y', 'P3Y'].map(t => (
          <button key={t} onClick={() => setTerm(t)} style={{
            padding: '5px 14px', borderRadius: 20, border: `1px solid ${t === term ? C.blue : C.border}`,
            background: t === term ? C.blue : 'white', color: t === term ? 'white' : C.text,
            fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          }}>{t === 'P1Y' ? '1 Year' : '3 Years'}</button>
        ))}
      </div>

      {loading ? <Spinner /> : error ? (
        <Alert type="error">{error}</Alert>
      ) : !data?.recommendations?.length ? (
        <Card>
          <EmptyState icon="📋" title="No Savings Plan recommendations available" sub={data?.note || 'Requires MCA/EA billing account and 30+ days of compute usage history.'} />
          <div style={{ padding: '0 16px 12px' }}>
            <Alert type="info">
              <strong>When does CSP apply?</strong><br />
              Use Savings Plans when you have heterogeneous compute (mix of VM sizes/regions) that changes over time. Use RIs when you have stable, predictable workloads on specific SKUs.
            </Alert>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>RI vs Savings Plan Comparison</div>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: C.light }}>
                    {['', 'Reserved Instances', 'Savings Plans'].map(h => (
                      <th key={h} style={{ padding: '7px 10px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, color: C.muted }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Flexibility', 'Fixed SKU + region', 'Flexible across SKU/region'],
                    ['Coverage', 'Specific VM family', 'VMs, AKS, Functions, App Service'],
                    ['Savings vs PAYG', 'Up to 72%', 'Up to 65%'],
                    ['Scope', 'Subscription or shared', 'Management Group'],
                    ['Best for', 'Stable, predictable workloads', 'Dynamic or heterogeneous compute'],
                    ['Exchange', 'Yes (within SKU family)', 'Not applicable (commitment-based)'],
                  ].map(([attr, ri, csp]) => (
                    <tr key={attr} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '7px 10px', fontWeight: 600, color: C.muted }}>{attr}</td>
                      <td style={{ padding: '7px 10px' }}>{ri}</td>
                      <td style={{ padding: '7px 10px' }}>{csp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      ) : (
        data.recommendations.map((rec, i) => (
          <Card key={i} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 600 }}>Azure Compute Savings Plan · {rec.termLabel}</div>
              <Badge label={`${rec.annualSavingsPercent}% savings`} color={C.green} />
            </div>
            <div style={{ margin: '10px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: C.light, borderRadius: 6, padding: 10 }}>
                <div style={{ fontSize: 11, color: C.muted }}>Recommended Hourly Commitment</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{fmtUSD(rec.commitmentAmount)}/hr</div>
              </div>
              <div style={{ background: '#F0FDF4', borderRadius: 6, padding: 10 }}>
                <div style={{ fontSize: 11, color: C.muted }}>Total Cost with Benefit</div>
                <div style={{ fontWeight: 700, fontSize: 18, color: C.green }}>{fmtUSD(rec.totalCostWithBenefit)}</div>
              </div>
            </div>
            {rec.allSavingsList?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>All term options:</div>
                {rec.allSavingsList.map((s, j) => (
                  <div key={j} style={{ fontSize: 11, display: 'flex', gap: 10, padding: '4px 0', borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontWeight: 500 }}>{s.term}</span>
                    <span style={{ color: C.green }}>{fmtPct(s.savingsPct)} savings</span>
                    <span style={{ color: C.muted }}>Commitment: {fmtUSD(s.commitmentAmount)}/hr</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))
      )}
    </div>
  );
}

// ─── TAB: FinOps Detail ───────────────────────────────────────────────────────

function FinOpsTab({ scope }) {
  const [view, setView] = useState('service');
  const [tagKey, setTagKey] = useState('Environment');

  const serviceUrl = scope ? `/api/costs/by-service?scope=${encodeURIComponent(scope)}` : null;
  const rgUrl      = scope ? `/api/costs/by-resource-group?scope=${encodeURIComponent(scope)}` : null;
  const tagUrl     = scope ? `/api/costs/by-tag?scope=${encodeURIComponent(scope)}&tagKey=${encodeURIComponent(tagKey)}` : null;
  const subUrl     = scope ? `/api/costs/by-subscription?scope=${encodeURIComponent(scope)}` : null;
  const budgetUrl  = scope ? `/api/costs/budgets?scope=${encodeURIComponent(scope)}` : null;
  const recUrl     = scope ? `/api/recommendations/all?scope=${encodeURIComponent(scope)}` : null;

  const serviceData = useApi(serviceUrl);
  const rgData      = useApi(rgUrl);
  const tagData     = useApi(tagUrl, [tagKey]);
  const subData     = useApi(subUrl);
  const budgetData  = useApi(budgetUrl);
  const recData     = useApi(recUrl);

  if (!scope) return <EmptyState icon="📊" title="Select a scope" />;

  const VIEWS = [
    { id: 'service',  label: 'By Service' },
    { id: 'rg',       label: 'By Resource Group' },
    { id: 'tag',      label: 'By Tag' },
    { id: 'sub',      label: 'By Subscription' },
    { id: 'budgets',  label: 'Budgets' },
    { id: 'optimize', label: 'Optimization' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {VIEWS.map(v => (
          <button key={v.id} onClick={() => setView(v.id)} style={{
            padding: '6px 14px', borderRadius: 20, border: `1px solid ${v.id === view ? C.blue : C.border}`,
            background: v.id === view ? C.blue : 'white', color: v.id === view ? 'white' : C.text,
            fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          }}>{v.label}</button>
        ))}
      </div>

      {view === 'service'  && <CostBreakdown data={serviceData} groupKey="services" labelKey="service" title="Cost by Azure Service" />}
      {view === 'rg'       && <CostBreakdown data={rgData} groupKey="resourceGroups" labelKey="resourceGroup" title="Cost by Resource Group" />}
      {view === 'sub'      && <CostBreakdown data={subData} groupKey="subscriptions" labelKey="subscription" title="Cost by Subscription" />}
      {view === 'tag'      && (
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: C.muted }}>Tag key:</span>
            {['Environment', 'Team', 'Project', 'CostCenter', 'Application'].map(k => (
              <button key={k} onClick={() => setTagKey(k)} style={{
                padding: '4px 12px', borderRadius: 20, border: `1px solid ${k === tagKey ? C.purple : C.border}`,
                background: k === tagKey ? C.purple : 'white', color: k === tagKey ? 'white' : C.text,
                fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
              }}>{k}</button>
            ))}
          </div>
          {tagData.data && (
            <div style={{ marginBottom: 8 }}>
              <Badge label={`Tag coverage: ${tagData.data.tagCoveragePercent}%`} color={tagData.data.tagCoveragePercent >= 80 ? C.green : C.amber} />
              {tagData.data.tagCoveragePercent < 80 && (
                <span style={{ fontSize: 11, color: C.muted, marginLeft: 8 }}>
                  {100 - tagData.data.tagCoveragePercent}% of spend is untagged — limits FinOps showback accuracy
                </span>
              )}
            </div>
          )}
          <CostBreakdown data={tagData} groupKey="tags" labelKey="tagValue" title={`Cost by ${tagKey} Tag`} />
        </div>
      )}
      {view === 'budgets'  && <BudgetsView data={budgetData} />}
      {view === 'optimize' && <OptimizeView data={recData} />}
    </div>
  );
}

function CostBreakdown({ data, groupKey, labelKey, title }) {
  if (data.loading) return <Spinner />;
  if (data.error)   return <Alert type="error">{data.error}</Alert>;
  if (!data.data)   return null;

  const items = data.data[groupKey] || [];
  const total = data.data.total || 0;
  if (!items.length) return <EmptyState icon="🔍" title="No data" sub="No cost data available for this grouping" />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
        <span style={{ fontSize: 12, color: C.muted }}>Total: {fmtCAD(total)}</span>
      </div>
      <TemporalBadge temporal={data.data._temporal} />
      <div style={{ height: 10 }} />
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: C.light }}>
            <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, color: C.muted, fontWeight: 600 }}>{labelKey === 'service' ? 'Service' : labelKey === 'resourceGroup' ? 'Resource Group' : labelKey === 'subscription' ? 'Subscription' : 'Tag Value'}</th>
            <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: `1px solid ${C.border}`, color: C.muted, fontWeight: 600 }}>MTD Spend (CAD)</th>
            <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: `1px solid ${C.border}`, color: C.muted, fontWeight: 600 }}>% of Total</th>
            <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: `1px solid ${C.border}`, color: C.muted, fontWeight: 600 }}>Share</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: '8px 10px', fontWeight: i < 3 ? 600 : 400 }}>{item[labelKey]}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 500 }}>{fmtCAD(item.cost)}</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', color: C.muted }}>{fmtPct(item.pctOfTotal)}</td>
              <td style={{ padding: '8px 10px', width: 120 }}>
                <ProgressBar value={item.pctOfTotal} max={100} color={C.blue} height={5} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BudgetsView({ data }) {
  if (data.loading) return <Spinner />;
  if (data.error)   return <Alert type="error">{data.error}</Alert>;
  if (!data.data?.budgets?.length) return (
    <EmptyState icon="💼" title="No budgets configured" sub="Create budgets in Azure Cost Management to enable tracking here. Budgets can be set at subscription or resource group scope." />
  );

  return (
    <div>
      {data.data.budgets.map((b, i) => (
        <Card key={i} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{b.name}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{b.category} · {b.timeGrain}</div>
            </div>
            <Badge label={b.status} color={b.status === 'EXCEEDED' ? C.red : b.status === 'AT_RISK' ? C.amber : C.green} />
          </div>
          <div style={{ margin: '10px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: C.muted }}>Spent: {fmtUSD(b.currentSpend)}</span>
              <span style={{ color: C.muted }}>Budget: {fmtUSD(b.amount)}</span>
            </div>
            <ProgressBar
              value={b.currentSpend}
              max={b.amount}
              color={b.status === 'EXCEEDED' ? C.red : b.status === 'AT_RISK' ? C.amber : C.green}
              height={10}
            />
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
              {b.spendPercent !== null ? `${b.spendPercent}% of budget used` : ''}
              {b.forecastedSpend ? ` · Forecasted: ${fmtUSD(b.forecastedSpend)}` : ''}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function OptimizeView({ data }) {
  if (data.loading) return <Spinner />;
  if (data.error)   return <Alert type="error">{data.error}</Alert>;
  if (!data.data?.recommendations?.length) return <EmptyState icon="✅" title="No optimization recommendations" sub="Azure Advisor has no current cost recommendations for this scope" />;

  const recs = data.data.recommendations;
  const total = data.data.totalPotentialAnnualSavings;

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <KPICard icon="💡" label="Recommendations" value={recs.length} />
        <KPICard icon="💰" label="Total Annual Potential" value={fmtCAD(total)} color={C.green} />
      </div>

      <TemporalBadge temporal={data.data._temporal} />
      <div style={{ height: 10 }} />

      {recs.slice(0, 20).map((r, i) => (
        <Card key={i} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 12 }}>{r.shortDescription}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                {r.type} · {r.resourceType} · Last updated: {r.lastUpdated ? new Date(r.lastUpdated).toLocaleDateString('en-CA') : '—'}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {r.annualSavingsUSD > 0 && (
                <div style={{ fontWeight: 700, color: C.green, fontSize: 13 }}>{fmtCAD(r.annualSavingsUSD)}/yr</div>
              )}
              <Badge label={r.impact || 'Medium'} color={r.impact === 'High' ? C.red : r.impact === 'Low' ? C.gray : C.amber} />
            </div>
          </div>
        </Card>
      ))}
      {recs.length > 20 && (
        <div style={{ textAlign: 'center', fontSize: 12, color: C.muted, padding: 10 }}>
          Showing top 20 of {recs.length} recommendations
        </div>
      )}
    </div>
  );
}

// ─── Main LiveAnalysis component ──────────────────────────────────────────────

const TABS = [
  { id: 'overview',   label: '📈 Executive Overview', desc: 'KPIs, trend, top drivers' },
  { id: 'ri',         label: '💎 Reservations',       desc: 'RI list, usage, savings, expiring' },
  { id: 'ri-buy',     label: '🎯 RI Buy Guide',       desc: 'Where to purchase new RIs' },
  { id: 'csp',        label: '📋 Savings Plans',      desc: 'Azure Compute Savings Plan analysis' },
  { id: 'finops',     label: '📊 FinOps Detail',      desc: 'By service, RG, tag, budgets' },
];

export default function LiveAnalysis() {
  const [tab, setTab] = useState('overview');
  const [scope, setScope] = useState(null);
  const healthUrl = '/api/health';
  const { data: health } = useApi(healthUrl);

  const azureConnected = health?.azure?.authValid === true;

  return (
    <div style={{ fontFamily: 'system-ui,-apple-system,sans-serif', maxWidth: 1200, margin: '0 auto', padding: '16px 20px', color: C.text }}>

      {/* Connection status banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18, color: C.navy }}>Live Azure Cost Analyzer</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
            Real-time data from Azure Cost Management, Advisor & Reservations APIs · All data stays in your environment
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, background: azureConnected ? '#F0FDF4' : '#FEF2F2', color: azureConnected ? C.green : C.red, border: `1px solid ${azureConnected ? C.green : C.red}40`, fontWeight: 600 }}>
            {azureConnected ? '● Connected' : '● Not connected'}
          </div>
          {health?.azure?.authMethod && (
            <span style={{ fontSize: 10, color: C.muted }}>{health.azure.authMethod}</span>
          )}
        </div>
      </div>

      {/* Auth warning */}
      {!azureConnected && health !== null && (
        <Alert type="warning">
          <strong>Azure credentials not configured.</strong> Set environment variables to enable live data:
          <br /><code style={{ fontFamily: 'monospace', background: '#FEF9C3', padding: '0 4px', borderRadius: 3 }}>AZURE_TENANT_ID</code>, <code style={{ fontFamily: 'monospace', background: '#FEF9C3', padding: '0 4px', borderRadius: 3 }}>AZURE_CLIENT_ID</code>, <code style={{ fontFamily: 'monospace', background: '#FEF9C3', padding: '0 4px', borderRadius: 3 }}>AZURE_CLIENT_SECRET</code>
          <br />Assign <strong>Cost Management Reader + Reservations Reader</strong> roles to the Service Principal at the tenant root Management Group.
          <br />See <strong>README.md → Azure Access Setup</strong> for step-by-step instructions.
        </Alert>
      )}

      {/* Scope selector */}
      {azureConnected && <ScopeSelector scope={scope || ''} onScopeChange={setScope} />}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`, marginBottom: 16, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} title={t.desc} style={{
            padding: '9px 16px', border: 'none', borderBottom: tab === t.id ? `3px solid ${C.blue}` : '3px solid transparent',
            background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: tab === t.id ? 700 : 400,
            color: tab === t.id ? C.blue : C.muted, fontFamily: 'inherit', whiteSpace: 'nowrap',
            transition: 'all .12s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && <OverviewTab scope={scope} />}
      {tab === 'ri'       && <ReservationsTab scope={scope} />}
      {tab === 'ri-buy'   && <RIBuyGuideTab scope={scope} />}
      {tab === 'csp'      && <SavingsPlansTab scope={scope} />}
      {tab === 'finops'   && <FinOpsTab scope={scope} />}

      {/* Footer */}
      <div style={{ marginTop: 24, paddingTop: 12, borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.muted, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <span>AzureCostIQ v4.0 · Azure Cost Management API · No data leaves this environment</span>
        <span>All prices in CAD (× {CAD_RATE} from USD) · Amounts shown in CAD unless stated otherwise</span>
      </div>
    </div>
  );
}
