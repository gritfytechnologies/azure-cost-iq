# Contributing to AzureCostIQ

Thank you for contributing. This file covers everything you need to add a new Azure service, update pricing, fix a bug, or improve the tool.

---

## Quick links

- [Ways to contribute](#ways-to-contribute)
- [Development setup](#development-setup)
- [Adding a new Azure service — full guide](#adding-a-new-azure-service--9-steps)
- [Updating a price](#updating-a-price)
- [Commit message conventions](#commit-message-conventions)
- [PR checklist](#pull-request-checklist)
- [Code style guide](#code-style-guide)

---

## Ways to contribute

| Type | Examples |
|------|---------|
| **New Azure service** | Azure Synapse Analytics, Azure Backup, Azure Container Registry, Azure DNS |
| **Price update** | Noticed a stale constant? Open a PR with the updated value |
| **Bug fix** | Calculation error, broken UI element, wrong output text |
| **Context improvement** | Better "i" panel explanations, Service Guide descriptions |
| **Feature** | Currency selector, save/load, URL sharing, RI vs PAYG comparison |
| **Documentation** | README improvements, examples, architecture diagrams |
| **Translation** | French, Spanish, German, Japanese — community-driven |

---

## Development setup

```bash
# Clone and install
git clone https://github.com/your-org/azure-cost-iq.git
cd azure-cost-iq
npm install

# Start dev server (hot reload, Vite proxy for /api/prices)
npm run dev
# → http://localhost:5173

# Test production build (matches App Service behaviour)
npm run build && node dist/server.js
# → http://localhost:8080
# → http://localhost:8080/health  → { "status": "ok", "version": "3.0.0" }
```

---

## Adding a new Azure Service — 9 steps

### Step 1 — Find the price from the Azure Retail Prices API

```bash
# No auth needed — public API
curl "https://prices.azure.com/api/retail/prices?\
$filter=armRegionName eq 'canadacentral' \
and serviceName eq 'Azure Synapse Analytics' \
and priceType eq 'Consumption'" \
| jq '.items[] | {meterName, skuName, retailPrice, unitOfMeasure}'
```

Find the `retailPrice` for each meter you need. Note the `meterName` to confirm you have the right SKU. Focus on `Consumption` price type (PAYG) rather than Reservation.

### Step 2 — Add to `PRICES_USD` in `App.jsx`

```js
export const PRICES_USD = {
  // ... existing services ...

  // ── Azure Synapse Analytics ────────────────────────────────────────────────
  // Source: Azure Retail Prices API, Canada Central, August 2026
  synapse: {
    dwu100cPerHour:     1.51,     // Dedicated SQL Pool DWU100c per hour
    dataFlowPerDBUHour: 0.274,    // Data Flow cluster per DBU-hour
    storagePerTBMonth:  23.00,    // Synapse Storage per TB/month
    serverlessPerTBScanned: 5.00, // Serverless SQL per TB scanned
  },
};
```

**Always include a source comment with the date.** This enables quarterly price verification.

### Step 3 — Add to `SERVICE_GUIDE` in `App.jsx`

Find the correct category object in `SERVICE_GUIDE` and add your service to its `services` array:

```js
{
  category: 'Data Platform',   // ← choose the right category
  color: '#2E75B6',
  services: [
    // ... existing services ...
    {
      name: 'Azure Synapse Analytics',
      icon: '🔮',
      what: 'Unified analytics service that combines enterprise data warehousing (Dedicated SQL Pool) with big data analytics (Apache Spark). Integrates natively with ADLS Gen2 and Power BI.',
      when: 'Large-scale SQL analytics workloads requiring dedicated compute (>1TB data, SLA requirements), or when you need Spark + SQL in one managed workspace.',
      drivers: [
        'DWU hours for Dedicated SQL Pool ($1.51/DWU100c/hr — DWU controls concurrency and speed)',
        'Data Flow cluster DBU-hours ($0.274/DBU-hr — for ETL orchestration)',
        'Serverless SQL per TB scanned ($5.00/TB — pay per query)',
        'Storage per TB/month ($23.00/TB)',
      ],
      notBilled: ['Synapse Studio UI', 'Workspace creation', 'Pipeline creation and monitoring', 'Serverless SQL metadata queries'],
      typical: '$500 – $5,000 CAD/month depending on DWU tier and query volume',
    },
  ],
},
```

### Step 4 — Add a color to `COLORS`

```js
const COLORS = {
  // ... existing ...
  synapse: '#6A0DAD',   // choose a distinct colour that doesn't clash
};
```

### Step 5 — Add React state variables

```js
// Inside the App() component, with the other state declarations
const [synDWUHrs, setSynDWUHrs]     = useState(8);     // hours/day DWU active
const [synStorTB, setSynStorTB]     = useState(1);      // TB stored
const [synSrvlsTB, setSynSrvlsTB]  = useState(0);      // TB scanned serverless/month
```

### Step 6 — Write the `calcXxx()` function

```js
const calcSynapse = useCallback(() => {
  const dwu  = synDWUHrs * 22 * PRICES_USD.synapse.dwu100cPerHour;
  const stor  = synStorTB * PRICES_USD.synapse.storagePerTBMonth;
  const srvls = synSrvlsTB * PRICES_USD.synapse.serverlessPerTBScanned;
  return (dwu + stor + srvls) * USD_TO_CAD;
}, [synDWUHrs, synStorTB, synSrvlsTB]);
```

### Step 7 — Add `useMemo` and include in `costs`

```js
// With the other useMemo declarations
// costs object — add your service:
const costs = {
  // ... existing ...
  synapse: useMemo(() => calcSynapse(), [calcSynapse]),
};
// subtotal is computed as Object.values(costs).reduce(...) — no change needed
```

### Step 8 — Add `<Section>` with `<Slider>` components in the render

Find the correct `<CategoryHeader>` block and add your section after it:

```jsx
<Section
  title="Azure Synapse Analytics"
  subtitle="Dedicated SQL Pool · Serverless SQL · Data Flows"
  color={COLORS.synapse}
  icon="🔮"
  cost={fM(costs.synapse)}
  open={openSecs.synapse}
  onToggle={() => toggleSec('synapse')}
>
  <IB v="purple">
    <strong>Two billing models:</strong> Dedicated SQL Pool = DWU hours × rate (always-on compute).
    Serverless SQL = $5/TB scanned (pay-per-query). Use serverless for exploration; dedicated for production SLA.
  </IB>
  <div style={{ ...G2, marginTop: 10 }}>
    <div>
      <Slider label="DWU active hours / day" min={0} max={24} step={0.5}
        value={synDWUHrs} onChange={setSynDWUHrs} unit="hrs"
        hint="DWU100c = $1.51/hr. Pause the pool when not in use to stop billing." />
      <Slider label="Storage (TB)" min={0} max={100} step={0.5}
        value={synStorTB} onChange={setSynStorTB} unit="TB"
        hint="$23/TB/month. Includes all Synapse storage." />
    </div>
    <div>
      <Slider label="Serverless SQL scanned (TB/month)" min={0} max={1000} step={10}
        value={synSrvlsTB} onChange={setSynSrvlsTB} unit="TB"
        hint="$5/TB scanned. First 10TB/month free." />
      <IB v="gray">
        Dedicated pool {fmt(synDWUHrs * 22 * PRICES_USD.synapse.dwu100cPerHour * USD_TO_CAD)}/mo ·
        Storage {fmt(synStorTB * PRICES_USD.synapse.storagePerTBMonth * USD_TO_CAD)}/mo ·
        Serverless {fmt(synSrvlsTB * PRICES_USD.synapse.serverlessPerTBScanned * USD_TO_CAD)}/mo
      </IB>
    </div>
  </div>
</Section>
```

Also add `synapse: false` to `initSecs` (section open/close state).

### Step 9 — Add to `enabledServices`, chart legend, and output generators

```js
// enabledServices array (for output generators and legend)
const enabledServices = [
  // ... existing ...
  { key: 'synapse', label: 'Azure Synapse Analytics' },
];

// Chart data — already handled: chartData is computed from enabledServices sorted by cost

// generateMemo and generateExport — already handled:
// both iterate enabledServices and use costs[s.key], so they pick up automatically
```

That's it. Run `npm run dev` and verify the new section appears, calculates correctly, and shows up in the chart, legend, cost memo, and CSV export.

---

## Updating a price

If you spot a stale price:

1. Query the API (Step 1 above) for the correct current value
2. Update the constant in `PRICES_USD`:

```js
// Before
vmD4asv5PerHour: 0.232,   // Source: Azure Retail Prices API, Canada Central, May 2026

// After
vmD4asv5PerHour: 0.238,   // Source: Azure Retail Prices API, Canada Central, August 2026
```

3. Open a PR with title: `chore: refresh [Service Name] pricing — August 2026`

For **quarterly batch updates** covering all services at once, check each service category and open a single PR: `chore: quarterly pricing refresh — Q3 2026`

---

## Commit message conventions

| Prefix | Use for |
|--------|---------|
| `feat:` | New service, new output format, new UI feature |
| `fix:` | Bug fix, calculation correction, broken UI |
| `chore:` | Price refresh, dependency update, maintenance |
| `docs:` | README, CONTRIBUTING, CHANGELOG, comment updates |
| `refactor:` | Code restructure without behaviour change |
| `style:` | Visual/CSS changes only |
| `test:` | Adding or updating tests |

Examples:
```
feat: add Azure Synapse Analytics (Dedicated Pool + Serverless)
chore: refresh AKS and VM pricing — Q3 2026
fix: SQL MI BC tier calculation using wrong hourly rate
docs: add Azure Backup to Service Guide roadmap
```

---

## Pull request checklist

Before opening a PR, verify every item:

**Code quality**
- [ ] `npm run dev` starts without errors or warnings
- [ ] `npm run build` completes without errors
- [ ] New section renders correctly in the UI
- [ ] Sliders update costs in real time
- [ ] Section appears collapsed by default (`initSecs` updated)

**Pricing**
- [ ] Price verified against Azure Retail Prices API (not assumed)
- [ ] Constant includes source comment with date
- [ ] Correct region: `canadacentral`
- [ ] Correct price type: `Consumption` (PAYG, not Reservation)
- [ ] No hardcoded price values in JSX — all in `PRICES_USD`

**Service Guide**
- [ ] Entry added to `SERVICE_GUIDE` in correct category
- [ ] `what` field: plain English, no jargon
- [ ] `when` field: concrete use-case scenarios
- [ ] `drivers` array: all billable dimensions listed
- [ ] `notBilled` array: free tier and common misunderstandings
- [ ] `typical` field: realistic CAD monthly range

**Integration**
- [ ] Color added to `COLORS` object
- [ ] Service key added to `enabledServices` array
- [ ] `initSecs` includes new section key (set to `false`)
- [ ] New service appears in cost memo output
- [ ] New service appears in CSV export
- [ ] New service appears in donut chart (if it's a top-10 cost item)

**Documentation**
- [ ] CHANGELOG.md updated under `[Unreleased]` or new version section
- [ ] No sensitive data (credentials, subscription IDs, tenant IDs) in any file

---

## Code style guide

**Architecture principles:**
- Single-file component (`App.jsx`) — intentional for portability. Can be pasted directly into StackBlitz or CodeSandbox without folder structure. Refactor only when file exceeds ~3,000 lines.
- Inline styles only — no CSS classes. Enables copy-paste reuse.
- CSS variables for theme-sensitive values: `var(--color-text-primary, #111)` — fallback for non-themed environments.

**React patterns:**
- `useCallback` for all calculation functions — prevents unnecessary recalculation
- `useMemo` for all derived results — calculations only rerun when dependencies change
- State declarations grouped by service (ADF, ADLS, Databricks, etc.)
- Descriptive state variable names: `dbrJobHrs` not `h1`, `aksNodeCount` not `n`

**Constants:**
- All prices in `PRICES_USD` (USD values) — convert to CAD at render time with `× USD_TO_CAD`
- Constants grouped by service with comments explaining the meter
- Source comment format: `// Source: Azure Retail Prices API, Canada Central, [Month Year]`

**Components:**
- `<Slider>` — for numeric ranges (hours, GB, count, percentage)
- `<Select>` — for dropdown tier selection (SKUs, tiers, billing models)
- `<Check>` — for boolean toggles (features, plan options)
- `<IB v="variant">` — InfoBox explanatory text (blue/teal/orange/amber/purple/green/red/cyan/gray)
- `<CL>` — ColLabel for column headers in grid layouts
- `<Section>` — collapsible service section with title, icon, cost display
- `<CategoryHeader>` — visual divider between service groups

**Layout constants:**
- `G2` — 2-column grid (most sections)
- `G3` — 3-column grid (ADLS medallion layers)
- `G4` — 4-column grid (Databricks compute types)

---

## Questions?

- Open a [Discussion](../../discussions) for design questions
- Open a [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md) for new services
- Open a [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) for calculation issues
