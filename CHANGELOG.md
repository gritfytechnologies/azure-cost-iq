# Changelog

All notable changes to AzureCostIQ are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) · Versioning: [SemVer](https://semver.org/)

---

## [3.0.0] — 2026-05-17

### ✨ Major release — 28 Azure services, Service Guide, 8 categories

#### New services added (14 new)
- **SQL Managed Instance** — General Purpose + Business Critical tiers, storage, full SQL Server feature set warning
- **App Service + App Service Plan** — B1/B2/B3, P1v3–P3v3, Isolated I1v2/I2v2 tiers; multi-app-per-plan model explained
- **Azure Key Vault** — Secret operations, HSM-backed keys, certificate renewals, Managed HSM
- **Azure ExpressRoute** — Circuit bandwidth tiers (50Mbps–10Gbps), Gateway tiers (Standard/HighPerf/UltraPerf), Metered vs Unlimited plans, data transfer
- **Azure Logic Apps** — Consumption (per-action) + Standard WS1/WS2/WS3, enterprise connector pricing (SAP, Salesforce)
- **Log Analytics Workspace** — PAYG + commitment tiers, retention beyond 31 days, Sentinel toggle (+$2.46/GB)
- **Azure Monitor & Alerts** — Custom metrics, alert rules, SMS notifications; free tier clearly documented
- **Microsoft Defender for Cloud** — Servers P2/P1, Containers, SQL, Storage, App Service, CSPM enhanced plans
- **Microsoft Defender for Endpoint** — MDE P2 per user, MDE for servers; double-count warning with Defender for Cloud
- **VNet Traffic & Data Transfer** — Intra/cross-region peering (both directions), internet egress, Private Endpoint hourly + per-GB
- **Azure AI Foundry** — GPU fine-tuning compute (NC6s v3), inference endpoints (DS3v2), storage for model artifacts, Prompt Flow
- **Azure AI Search** — Basic/S1/S2/S3 tiers, replicas × partitions cost model, Semantic Ranker per-1K-query pricing
- **Azure ML Workspace** — Compute instances, GPU training clusters (NC6s v3), managed inference endpoints, feature store storage
- **Azure VPN Gateway** — VpnGw1/VpnGw2 added to VNet networking section as alternative to ExpressRoute

#### New features
- **Service Guide modal** — Full searchable, categorised guide for all 28 services
  - "What it is" in plain English for every service
  - "When your project needs it" — use-case scenarios for non-technical stakeholders
  - "Cost drivers" panel (orange) — every meter that affects the bill
  - "Not billed" panel (green) — common misunderstandings, free tiers
  - "Typical monthly range" in CAD for realistic workload
  - Built-in "How to add a new service" instructions with code snippets
  - Searchable across all services and categories
  - Category tabs for fast navigation
- **Category headers** — Visual section dividers grouping 28 services into 8 categories
- **Per-section InfoBox** — Every service section opens with a billing model explanation and key tips
- **5 metric cards** — Total Monthly, Annual, Compute+Data, AI+DB, Security+Ops
- **Prominent Service Guide button** — In header AND at bottom of estimator
- **SQL MI warning** — Explicit "only use if you need SQL Agent/CLR/linked servers" guidance
- **App Service multi-app model** — Clear explanation that multiple apps share one ASP at no extra cost
- **Defender double-count warning** — Prevents double-billing MDE servers already covered by Defender for Cloud
- **ExpressRoute telecom note** — Reminds teams to add provider circuit cost separately

#### Changed
- All sections collapsed by default (previously some open) — cleaner initial view
- Header redesigned with gradient, project name input, and status badge
- Metric cards expanded from 4 to 5 with Security+Ops breakout
- Chart updated to show top 10 services (was top 8)
- `generateMemo` now lists only services with >$0.50 monthly cost (avoids zero-value clutter)
- `generateOptimization` expanded to 9 prioritised strategies with specific actionable steps
- `generateExport` includes status column (Included/Zero) for each service
- Version bumped from 2.1.0 → 3.0.0 (breaking change: PRICES_USD expanded significantly)

#### Pricing verified May 2026 (new constants)
- SQL MI: GP 4/8/16 vCore, BC 4/8 vCore, storage ($0.115/GB)
- App Service Plan: B1/B2/B3, P1v3/P2v3/P3v3, I1v2/I2v2 Linux PAYG
- Key Vault: operations ($0.03/10K), HSM keys ($5/key/month), certificate renewals ($3.00)
- ExpressRoute: 50Mbps–10Gbps circuits, Standard/HighPerf/UltraPerf gateways, data transfer ($0.025/GB metered)
- Logic Apps: Consumption actions ($0.025/1K), enterprise connectors ($0.50/1K), Standard WS1/WS2/WS3
- Log Analytics: PAYG $2.30/GB, commitment tiers, retention $0.10/GB/month beyond 31 days, Sentinel $2.46/GB
- Azure Monitor: custom metrics $0.10/million, alert rules $0.10/rule/month, SMS $0.75/100
- Defender for Cloud: Servers P2 $15/server/month, Containers $7/vCore/month, SQL $15/server/month, Storage $10/account/month
- Defender for Endpoint: MDE P2 $5.20/user/month, $5.20/device/month
- VNet peering: intra-region $0.01/GB, cross-region $0.035/GB; internet egress $0.087/GB first 10TB
- AI Foundry: NC6s v3 $3.06/hr, DS3v2 inference $0.252/hr, storage $0.023/GB/month
- AI Search: Basic $0.101/hr, S1 $0.290/hr, S2 $1.153/hr, S3 $4.612/hr, Semantic Ranker $0.01/1K
- ML Workspace: DS3v2 compute instance $0.252/hr, NC6s v3 GPU $3.06/hr, inference $0.232/hr

---

## [2.1.0] — 2026-05-10

### Changed
- **CORS-safe pricing fetch** — `fetch()` URL changed from `https://prices.azure.com/api/retail/prices` (direct, CORS error in dev) to `/api/prices` (relative URL, proxied by Vite in dev and Express in prod)
- All environments now work without CORS errors: localhost:5173, localhost:8080, Azure App Service
- No `import.meta.env.DEV` branching required
- `server.js` — confirmed `GET /api/prices` route forwards query string to `prices.azure.com`
- `vite.config.js` — confirmed proxy rule for `/api/prices` → `https://prices.azure.com`
- Version comment updated in App.jsx header

### Fixed
- CORS error when running `npm run dev` due to direct Azure API call from browser
- Price status badge stuck on default text after successful live fetch in some environments

---

## [2.0.0] — 2026-05-01

### ✨ Major release — AzureCostIQ (renamed from CDP Cost Estimator)

#### Added
- Azure Kubernetes Service (AKS) — node pools, VM SKUs, Uptime SLA toggle
- Azure Functions — Consumption (per-execution) + Premium EP1/EP2/EP3 tiers
- Azure Container Apps — consumption plan (vCPU + GB-seconds)
- Azure SQL Database — General Purpose vCore, Serverless auto-pause, storage
- Azure Cosmos DB — Serverless (per-RU) and Provisioned (RU/s) billing models
- Azure Cache for Redis — C1/C2/C3 Standard, P1/P2 Premium tiers
- Azure Service Bus — Standard (per-operation) + Premium (Messaging Units)
- Azure Event Hubs — Standard TUs, Premium PUs, Capture toggle
- Azure OpenAI Service — GPT-4o, GPT-4o mini, Ada embeddings (token-based)
- Azure Virtual Machines — B2s, D4s/D8s v3, E4s v3, F8s v2 + managed disks
- Azure Application Gateway — WAF v2, Standard v2, capacity units
- Azure Front Door — Standard and Premium tiers
- PRICES_USD constants with verified May 2026 prices + source comments
- SERVICE_GUIDE array — descriptions for all services
- Donut chart (Chart.js) — top 8 services by cost
- Monthly ↔ Annual toggle
- Cost memo output generator
- Optimization strategies output generator
- CSV export generator
- Full Terraform IaC for private Azure App Service
- azure-pipelines.yml — ADO CI/CD pipeline (Build + Deploy stages)
- README.md with ASCII architecture diagrams
- CONTRIBUTING.md with step-by-step service addition guide
- CHANGELOG.md, SECURITY.md, LICENSE (MIT)
- GitHub issue templates, PR template, Actions CI workflow

#### Changed
- Renamed from "CDP Cost Estimator" to **AzureCostIQ**
- Removed IO/CDP-specific defaults (APIM allocation changed from 15% to 100%)
- Generic project name default ("My Azure Project" vs "Kahua Datamart")
- APIM section generalised (no CDP-specific FR-001 references)

---

## [1.0.0] — 2026-04-01

### Added
- Initial release as Infrastructure Ontario CDP Project Cost Estimator
- Five services: ADF, ADLS Gen2, Databricks Premium (job+interactive+SQL+serverless), APIM, Power BI
- Donut chart, monthly/annual toggle, cost breakdown InfoBoxes
- Kahua Datamart defaults (25 ADF runs/day, 600/900/250 GB Bronze/Silver/Gold, 80K APIM calls/day)
- CDP-specific context panels (FR-001, Unity Catalog, APIOps)
