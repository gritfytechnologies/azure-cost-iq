<div align="center">

```
    ___                           ______           __  ____  __
   /   |____  __  __________     / ____/___  _____/ /_/  _/ / /
  / /| /_  / / / / ___/ _ \    / /   / __ \/ ___/ __// / / /
 / ___ |/ /_/ /_/ /  /  __/   / /___/ /_/ (__  ) /_ / / /_/
/_/  |_/___/\__,_/   \___/    \____/\____/____/\__/___/ (_)
```

### ⚡ **AzureCostIQ**
**From whiteboard to budget — in minutes.**

*The open-source, consumption-based Azure project cost estimation tool for architects, engineers, and project leads*

---

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-3.0.0-brightgreen)](CHANGELOG.md)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![Node](https://img.shields.io/badge/Node.js-20%20LTS-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Azure](https://img.shields.io/badge/Cloud-Azure-0089D6?logo=microsoft-azure&logoColor=white)](https://azure.microsoft.com)
[![Pricing API](https://img.shields.io/badge/Live%20Pricing-Azure%20Retail%20API-0078D4?logo=microsoft)](https://prices.azure.com)
[![No Auth Required](https://img.shields.io/badge/No%20Account-Required-success)](https://github.com/your-org/azure-cost-iq)

<br/>

[**⬇ Quick Start**](#-quick-start) · [**📚 Service Guide**](#-supported-azure-services-28-across-8-categories) · [**🏗 Architecture**](#-architecture) · [**➕ Add a Service**](#-adding-a-new-azure-service) · [**🤝 Contributing**](CONTRIBUTING.md) · [**📋 Changelog**](CHANGELOG.md)

</div>

---

## What is AzureCostIQ?

**AzureCostIQ** is a free, open-source Azure project cost estimation tool that helps cloud architects, platform engineers, and project teams build accurate, consumption-based cost forecasts **before a single line of code is written or a dollar is committed.**

Instead of navigating the Azure Pricing Calculator across a dozen browser tabs, AzureCostIQ gives you:

- **28 Azure services** in one screen, grouped by category
- **Sliders for every billable dimension** — runs/day, GB, vCore-hours, DBU/hr, tokens, API calls
- **Live pricing** from the Azure Retail Prices API (falls back to verified constants)
- **Built-in Service Guide** — plain-English explanations of what every service does, when you need it, and what drives cost
- **One-click outputs** — formatted cost memo, optimization roadmap, and CSV export

> **No login. No data leaves your browser. Runs locally in 2 minutes. Deployable to Azure App Service in 10.**

---

## Why AzureCostIQ?

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    BEFORE: The estimation problem                        │
├─────────────────────────────────────────────────────────────────────────┤
│  Azure Pricing Calculator — 12 browser tabs   → 2 hours, wrong numbers │
│  Excel spreadsheet estimate                   → Stale prices, no live   │
│  "We'll figure out costs later"               → Budget overrun at GA    │
│  Post-build Azure bill arrives                → Escalation to VP        │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    AFTER: The AzureCostIQ approach                       │
├─────────────────────────────────────────────────────────────────────────┤
│  28 services on one screen, sliders for every meter   → 5 minutes      │
│  Live Azure Retail Prices API + verified fallbacks    → Accurate        │
│  Service Guide modal explains every service           → Any team        │
│  Cost memo + CSV export + optimization roadmap        → Board-ready     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## ✨ Features

| Feature | Description |
|---|---|
| 🎛️ **28 Azure Services** | Complete coverage across Data, Compute, DB, AI/ML, Integration, Networking, Security, Monitoring |
| 📊 **Donut chart** | Visual top-10 cost breakdown — updates live as sliders change |
| 💰 **Live pricing** | Fetches real prices from Azure Retail Prices API on load |
| 🔄 **Monthly ↔ Annual toggle** | Instant projection switch |
| 📚 **Service Guide modal** | Searchable, categorised guide — what each service is, when you need it, cost drivers, what's free |
| ℹ️ **Per-component cost explanations** | Every slider section has an InfoBox explaining exactly what drives cost |
| 📄 **Cost memo** | Leadership-ready formatted estimate with scenarios |
| ⚡ **Optimization roadmap** | 9 prioritised strategies with specific actions |
| ⬇️ **CSV export** | Full breakdown for Excel, PowerPoint, or business cases |
| ✏️ **Editable project name** | Multi-project use — rename and re-export |
| 🔒 **No telemetry** | Nothing leaves your machine |
| ☁️ **CORS-safe proxy** | Works on localhost AND Azure App Service without code changes |

---

## 📊 Supported Azure Services — 28 across 8 categories

```
┌────────────────────────────────────────────────────────────────────────────┐
│  📊 DATA PLATFORM                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │   ADF    │ │ ADLS Gen2│ │Databricks│ │   APIM   │ │ Power BI │        │
│  │Pipelines │ │ B/S/Gold │ │ Premium  │ │Standard  │ │Pro/PPU/P1│        │
│  │DIU·Copy  │ │ Hot/Cool │ │Job·Int·  │ │ v2·Dev   │ │          │        │
│  │SHIR      │ │ Archive  │ │SQL·Srvls │ │          │ │          │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
├────────────────────────────────────────────────────────────────────────────┤
│  ⚙️ COMPUTE                                                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                     │
│  │   AKS    │ │Functions │ │App Svc + │ │Virtual   │                     │
│  │Node pools│ │Consumpt. │ │   ASP    │ │Machines  │                     │
│  │SLA toggle│ │Premium   │ │B·P·I tier│ │B·D·E·F   │                     │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘                     │
├────────────────────────────────────────────────────────────────────────────┤
│  🗃️ DATABASE & STORAGE                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                     │
│  │  SQL DB  │ │  SQL MI  │ │ Cosmos DB│ │  Redis   │                     │
│  │Serverless│ │  GP · BC │ │Srvls·Prov│ │ C1-C3·P1 │                     │
│  │Provisioned│ │          │ │          │ │ Standard │                     │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘                     │
├────────────────────────────────────────────────────────────────────────────┤
│  🤖 AI & MACHINE LEARNING                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                     │
│  │  OpenAI  │ │AI Foundry│ │ AI Search│ │    ML    │                     │
│  │GPT-4o    │ │Fine-tune │ │Basic·S1  │ │Workspace │                     │
│  │4o-mini   │ │Inference │ │Semantic  │ │Compute·  │                     │
│  │Embeddings│ │Prompt Flw│ │Ranker    │ │GPU·Infer │                     │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘                     │
├────────────────────────────────────────────────────────────────────────────┤
│  🔗 INTEGRATION & MESSAGING                                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                                   │
│  │ Service  │ │  Event   │ │  Logic   │                                   │
│  │   Bus    │ │  Hubs    │  │   Apps  │                                   │
│  │Std·Prem  │ │TU·PU·Cap │ │Consump· │                                   │
│  │Queues    │ │ Kafka    │ │Standard  │                                   │
│  └──────────┘ └──────────┘ └──────────┘                                   │
├────────────────────────────────────────────────────────────────────────────┤
│  🌐 NETWORKING                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                                   │
│  │  VNet    │ │Express   │ │  App GW  │                                   │
│  │ Traffic  │ │  Route   │ │  + WAF   │                                   │
│  │Peer·Egr  │ │Circuit + │ │ v2·WAFv2 │                                   │
│  │Priv. EP  │ │ Gateway  │ │Cap Units │                                   │
│  └──────────┘ └──────────┘ └──────────┘                                   │
├────────────────────────────────────────────────────────────────────────────┤
│  🔒 SECURITY & COMPLIANCE                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                                   │
│  │   Key    │ │Defender  │ │Defender  │                                   │
│  │  Vault   │ │for Cloud │ │  for EP  │                                   │
│  │Sec·Key·  │ │Servers · │ │MDE P2   │                                   │
│  │HSM·Certs │ │SQL·CSPM  │ │User·Srvr│                                   │
│  └──────────┘ └──────────┘ └──────────┘                                   │
├────────────────────────────────────────────────────────────────────────────┤
│  📋 MONITORING & OPERATIONS                                                │
│  ┌──────────┐ ┌──────────┐                                                 │
│  │   Log    │ │  Azure   │                                                 │
│  │Analytics │ │ Monitor  │                                                 │
│  │Ingest·   │ │Metrics · │                                                 │
│  │Retention │ │ Alerts   │                                                 │
│  │+Sentinel │ │   SMS    │                                                 │
│  └──────────┘ └──────────┘                                                 │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AZURECOSTIQ ARCHITECTURE                        │
│                                                                         │
│   ┌───────────────────────────────────────────────────────────────┐    │
│   │                   BROWSER  (React 18 SPA)                     │    │
│   │                                                               │    │
│   │  Sliders → useState → useCallback calcs → useMemo totals     │    │
│   │  Chart.js donut chart (top 10 services by cost)              │    │
│   │  Service Guide modal (28 services, searchable)               │    │
│   │  Output generators → Cost memo · CSV · Optimization          │    │
│   │                                                               │    │
│   │         GET /api/prices?$filter=... (relative URL)           │    │
│   └───────────────────────┬───────────────────────────────────────┘    │
│                           │  Same origin — CORS never triggered        │
│   ┌───────────────────────▼───────────────────────────────────────┐    │
│   │                   NODE.JS SERVER LAYER                        │    │
│   │                                                               │    │
│   │  DEV  (port 5173)  Vite proxy in vite.config.js             │    │
│   │                    /api/prices → prices.azure.com            │    │
│   │                                                               │    │
│   │  PROD (App Service) Express GET /api/prices in server.js     │    │
│   │                    /api/prices → prices.azure.com            │    │
│   │                                                               │    │
│   │  GET /health  → { status: ok }                               │    │
│   │  GET /*       → dist/index.html  (SPA fallback)              │    │
│   └───────────────────────┬───────────────────────────────────────┘    │
│                           │                                             │
│              ┌────────────▼──────────────┐                             │
│              │   Azure Retail Prices API  │                             │
│              │   prices.azure.com         │                             │
│              │   Public · No auth needed  │                             │
│              │   Canada Central region    │                             │
│              └───────────────────────────┘                             │
│                                                                         │
│  CORS GUARANTEE: The browser calls /api/prices on the same origin.    │
│  Node.js makes the outbound request. CORS never applies.               │
│  Works identically on localhost:5173, localhost:8080, App Service.     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Option 1 — Run locally (2 minutes)

```bash
# Clone and install
git clone https://github.com/your-org/azure-cost-iq.git
cd azure-cost-iq
npm install

# Start development server
npm run dev
# → Open http://localhost:5173
```

### Option 2 — Test production build locally

```bash
npm run build
node dist/server.js
# → Open http://localhost:8080
# → GET http://localhost:8080/health  →  { "status": "ok" }
```

### Option 3 — Deploy to Azure App Service (10 minutes)

```bash
# Build
npm run build && cp server.js dist/ && cp package.json dist/

# Deploy via Azure CLI
az webapp up \
  --name my-azure-cost-iq \
  --resource-group my-rg \
  --runtime "NODE:20-lts" \
  --sku B2 \
  --os-type Linux
```

### Option 4 — CI/CD via Azure DevOps

Push to your repo and let `azure-pipelines.yml` handle it:

```
Commit → Build stage (npm ci → build → zip) → Deploy stage → Azure App Service
```

> Set an approval gate on the production environment in ADO → Environments for change-controlled deployments.

### Option 5 — Private enterprise deployment (Terraform + VNet)

```bash
cd terraform/
# 1. Edit terraform.tfvars (subscription_id, tenant_id, auth_client_id)
# 2. Create remote state storage (instructions in terraform/README.md)
# 3. Apply
terraform init && terraform plan && terraform apply
```

Provisions: private App Service (public_network_access_enabled = false), private endpoint, VNet integration, Key Vault, Log Analytics, App Insights, Entra ID Easy Auth.

---

## 📁 Repository Structure

```
azure-cost-iq/
│
├── 📋 README.md                     This file
├── 📋 CONTRIBUTING.md               How to add services and contribute
├── 📋 CHANGELOG.md                  Version history (Keep a Changelog format)
├── 📋 LICENSE                       MIT License
├── 📋 SECURITY.md                   Vulnerability reporting policy
│
├── ⚙️  package.json                  Dependencies (React, Vite, Chart.js, Express)
├── ⚙️  vite.config.js               Vite build config + /api/prices dev proxy
├── ⚙️  server.js                     Express: SPA serving + /api/prices proxy + /health
├── ⚙️  azure-pipelines.yml           ADO CI/CD → Azure App Service (2 stages)
├── ⚙️  .gitignore
│
├── 🌐 index.html                    Vite HTML entry point
│
├── 📁 src/
│   ├── main.jsx                     React 18 entry (createRoot)
│   ├── App.jsx                  ★   All logic — 28 services, Service Guide, outputs
│   └── index.css                    Global reset + range slider styles
│
├── 📁 terraform/                    Private App Service IaC
│   ├── README.md                    Terraform walkthrough
│   ├── terraform.tfvars         ★   Only file you edit before apply
│   ├── providers.tf                 AzureRM 3.110 + remote state backend
│   ├── variables.tf
│   ├── locals.tf                    Naming convention helpers
│   ├── main.tf                      VNet, subnets, NSGs, private endpoints, DNS
│   ├── app_service.tf               Linux Web App + Easy Auth + VNet integration
│   ├── monitoring.tf                Log Analytics + App Insights + alerts
│   ├── keyvault.tf                  Key Vault + managed identity access
│   └── outputs.tf
│
└── 📁 .github/
    ├── ISSUE_TEMPLATE/
    │   ├── bug_report.md
    │   └── feature_request.md
    ├── pull_request_template.md
    └── workflows/
        └── ci.yml                   GitHub Actions: install → build → verify
```

> ★ = the files you interact with most

---

## 📚 Service Guide (built-in)

AzureCostIQ v3.0 includes a full **in-app Service Guide** — click the **📚 Service Guide** button in the header or at the bottom of the estimator.

```
┌────────────────────────────────────────────────────────────────────┐
│  📚  Azure Service Guide                                           │
│  ──────────────────────────────────────────────────────────────── │
│  [ Data Platform ] [ Compute ] [ Database ] [ AI & ML ] [ ... ]   │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │ 🤖  Azure OpenAI Service                                 │     │
│  │                                                          │     │
│  │ WHAT IT IS                                               │     │
│  │ Access to GPT-4o, GPT-4o mini, DALL-E, and embedding    │     │
│  │ models via Azure APIs with enterprise security...        │     │
│  │                                                          │     │
│  │ WHEN YOUR PROJECT NEEDS IT                               │     │
│  │ Adding AI capabilities: chat assistants, document        │     │
│  │ summarisation, semantic search...                        │     │
│  │                                                          │     │
│  │ ┌────────────────────┐  ┌──────────────────────────┐    │     │
│  │ │ 💰 Cost drivers    │  │ ✓ Not billed             │    │     │
│  │ │ ▸ Input tokens/1K  │  │ ✓ Model deployment       │    │     │
│  │ │ ▸ Output tokens/1K │  │ ✓ Azure OpenAI Studio    │    │     │
│  │ │ ▸ Model choice     │  │ ✓ Cached tokens (-60%)   │    │     │
│  │ └────────────────────┘  └──────────────────────────┘    │     │
│  │                                                          │     │
│  │ 💡 Typical range: $50 – $2,000+ CAD/month               │     │
│  └──────────────────────────────────────────────────────────┘     │
│                                                    [ Close guide ] │
└────────────────────────────────────────────────────────────────────┘
```

Every service in the guide covers:

- **What it is** — plain English, no jargon
- **When your project needs it** — use-case scenarios for project teams
- **Cost drivers** — every dimension that adds to your bill (orange panel)
- **Not billed** — what's free and often misunderstood (green panel)
- **Typical monthly range** in CAD for a realistic workload
- **How to add a new service** — step-by-step with code examples (bottom of guide)

---

## 💡 How pricing works

### Billing model

All calculations follow:

```
Monthly Cost (CAD) = Consumption × Unit Price (USD) × Exchange Rate (CAD/USD)
```

Every service has a dedicated `calcXxx()` function using `useCallback`. Results are memoised with `useMemo` — costs only recalculate when the relevant slider changes.

### Live pricing fetch (CORS-safe)

```
Browser → GET /api/prices?$filter=armRegionName eq 'canadacentral'...
               │
               │ (same-origin request — no CORS)
               ▼
    Node.js (Vite proxy in dev | Express in prod)
               │
               │ (server-side outbound HTTP)
               ▼
    prices.azure.com/api/retail/prices
               │
               ▼
    JSON → updates status badge in header
           PRICES_USD constants serve as fallback
```

Falls back silently to `PRICES_USD` constants if the API is unavailable. The app continues to function normally — the status badge in the header shows whether prices are live or static.

### Refreshing prices manually

```bash
# Query any service — no auth needed
curl "https://prices.azure.com/api/retail/prices?\
$filter=armRegionName eq 'canadacentral' \
and serviceName eq 'Azure Kubernetes Service' \
and priceType eq 'Consumption'"

# Pipe to jq for readable output
| jq '.items[] | {meterName, retailPrice, unitOfMeasure}'
```

Update the relevant constant in `PRICES_USD` and add a source comment:

```js
aks: {
  // Source: Azure Retail Prices API, Canada Central, August 2026
  vmD4asv5PerHour: 0.232,
  ...
}
```

---

## ➕ Adding a New Azure Service

The full guide is in [CONTRIBUTING.md](CONTRIBUTING.md) and inside the in-app **📚 Service Guide** (bottom of the modal). Summary:

### Step 1 — Look up the price

```bash
curl "https://prices.azure.com/api/retail/prices?\
$filter=armRegionName eq 'canadacentral' \
and serviceName eq 'Azure Synapse Analytics' \
and priceType eq 'Consumption'"
```

Note the `retailPrice`, `meterName`, and `skuName` for each meter you need.

### Step 2 — Add to `PRICES_USD`

```js
// In App.jsx — PRICES_USD object
synapse: {
  // Source: Azure Retail Prices API, Canada Central, August 2026
  dwu100cPerHour:    1.51,   // Dedicated SQL Pool DWU100c per hour
  dataFlowPerDBUHour: 0.274, // Data Flow cluster per DBU-hour
  storagePerTBMonth:  23.00, // Synapse Storage per TB/month
},
```

### Step 3 — Add to `SERVICE_GUIDE`

```js
{
  name: 'Azure Synapse Analytics',
  icon: '🔮',
  what: 'Unified analytics service combining enterprise data warehousing...',
  when: 'Large-scale SQL analytics workloads requiring dedicated capacity...',
  drivers: ['DWU hours (Dedicated SQL Pool)', 'Data Flow DBU-hours', 'Storage per TB'],
  notBilled: ['Workspace creation', 'Synapse Studio UI', 'Serverless SQL queries (first 10TB)'],
  typical: '$500 – $5,000 CAD/month depending on DWU tier',
},
```

### Step 4 — Add state, calculation, and section

```js
// useState
const [synDWUHrs, setSynDWUHrs] = useState(8);

// useCallback calculation
const calcSynapse = useCallback(() => {
  return synDWUHrs * 22 * PRICES_USD.synapse.dwu100cPerHour * USD_TO_CAD;
}, [synDWUHrs]);

// useMemo result — add total to subtotal
const synResult = useMemo(() => calcSynapse(), [calcSynapse]);

// <Section> in render under correct CategoryHeader
// Add to enabledServices, COLORS, chart data, output generators
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the complete 9-step checklist.

---

## 🚢 Deployment Options

| Option | Time | Best for |
|--------|------|---------|
| `npm run dev` (local) | 2 min | Local estimation, demos, development |
| Paste `App.jsx` into StackBlitz | 1 min | Quick sharing — no installation |
| Azure App Service (Azure CLI) | 10 min | Team sharing, internal tool |
| Azure App Service (ADO CI/CD) | 30 min | Enterprise deployment, auto-deploy on push |
| Private App Service + VNet (Terraform) | 1 hr | Regulated environments, internal-only access |

### Environment variables (production)

| Variable | Purpose | Required |
|----------|---------|---------|
| `WEBSITE_NODE_DEFAULT_VERSION` | `~20` | Set automatically by Azure |
| `NODE_ENV` | `production` | Set automatically by Azure CLI |
| `TF_VAR_auth_client_secret` | Entra ID app secret for Easy Auth | Only if using Terraform Easy Auth |

No other environment variables needed — pricing is fetched live at runtime.

---

## 🔒 Security

- **No auth required** to run locally
- **Private enterprise deployment** available via Terraform (`public_network_access_enabled = false`, private endpoints, Entra ID Easy Auth)
- **No telemetry** — nothing is collected or transmitted except the Azure Retail Prices API call
- **No secrets in code** — pricing API is public and unauthenticated
- See [SECURITY.md](SECURITY.md) for vulnerability reporting policy

---

## 🤝 Contributing

Contributions are what make open-source tools great. The easiest contribution is **adding a new Azure service** — new services make this tool more useful for every team.

**Good first issues:**
- Adding Azure Synapse Analytics
- Adding Azure Backup pricing
- Adding Azure DNS (private + public zones)
- Improving mobile responsiveness
- Adding dark mode support
- Adding currency selector (USD, GBP, EUR, AUD)

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide including code patterns, pricing verification steps, and PR checklist.

---

## 🗺️ Roadmap

**Next up:**
- [ ] Azure Synapse Analytics (SQL Pool + Spark)
- [ ] Azure Backup + Azure Site Recovery
- [ ] Azure DNS (private + public zones)
- [ ] Azure Container Registry (ACR)
- [ ] Azure API Center

**Planned:**
- [ ] Multi-region cost comparison side-by-side
- [ ] Save / load estimates (localStorage)
- [ ] Share via URL parameters (encode state in query string)
- [ ] PDF export (formatted report)
- [ ] Currency selector (USD / GBP / EUR / AUD / INR)
- [ ] Reserved Instance vs PAYG comparison toggle
- [ ] Azure Hybrid Benefit toggle (Windows VM / SQL)
- [ ] Commitment tier calculator (Log Analytics, Event Hubs)
- [ ] Project archiving (compare multiple estimates)

---

## 📋 Pricing Accuracy

| Item | Detail |
|------|--------|
| Region | Canada Central (`canadacentral`) |
| Currency | CAD at `USD_TO_CAD = 1.38` (review monthly) |
| Price type | Consumption (PAYG) — not Reserved Instance |
| Last verified | May 2026 |
| Source | [Azure Retail Prices API](https://prices.azure.com/api/retail/prices) |
| Live fetch | On app load via `/api/prices` proxy route |
| Fallback | `PRICES_USD` constants in `App.jsx` |

> Prices change periodically. The app fetches live on load. For quarterly batch updates, run the API queries in [CONTRIBUTING.md §1](CONTRIBUTING.md) and update constants with a commit like `chore: refresh Azure Canada Central pricing — Q3 2026`.

---

## 🙏 Acknowledgements

- [Azure Retail Prices API](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices) — Microsoft's public, auth-free pricing API
- [Chart.js](https://www.chartjs.org/) — Donut chart visualisation
- [Vite](https://vitejs.dev/) — Lightning-fast build tooling
- [React 18](https://react.dev/) — UI framework
- [Express](https://expressjs.com/) — CORS proxy server

---

## 📄 License

MIT — free to use, fork, modify, and deploy commercially. See [LICENSE](LICENSE).

---

<div align="center">

**AzureCostIQ** · MIT License · Built for the Azure community

*If this saved your team hours on a project estimate, consider starring ⭐ the repo*

[Report a Bug](/.github/ISSUE_TEMPLATE/bug_report.md) · [Request a Feature](/.github/ISSUE_TEMPLATE/feature_request.md) · [Contributing Guide](CONTRIBUTING.md)

</div>
