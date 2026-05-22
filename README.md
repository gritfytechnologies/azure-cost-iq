# ⚡ AzureCostIQ v4.0

**Enterprise Azure cost estimation, reservation analysis, and FinOps dashboards — self-hosted, no data leaves your environment.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-4.0.0-brightgreen)](CHANGELOG.md)
[![Node](https://img.shields.io/badge/Node.js-20%20LTS-339933?logo=node.js)](https://nodejs.org)
[![Azure](https://img.shields.io/badge/Cloud-Azure-0089D6?logo=microsoft-azure)](https://azure.microsoft.com)

---

## What is AzureCostIQ?

AzureCostIQ is a **two-tab tool** built for Azure Cloud Platform Architects and FinOps teams:

| Tab | Purpose | Data source |
|---|---|---|
| **Cost Estimator** | Slide-to-estimate for 28 Azure services | Azure Retail Prices API (public) |
| **Live Analyzer** | Real Azure spend, RI analysis, FinOps dashboards | Azure Cost Management, Advisor, Reservations APIs |

> **Privacy guarantee:** All Azure API calls are made from the backend server to Microsoft. No data is forwarded to any third party. The frontend only communicates with your own backend. This tool can be fully air-gapped inside a client VNet.

---

## Features

### Cost Estimator
- 28 Azure services with slider-based estimation
- Live Azure Retail Prices API (Canada Central, CAD)
- Service Guide explaining every service cost driver
- Output: Cost memo, optimization roadmap, CSV export

### Live Analyzer (v4.0)

#### Executive Overview Dashboard
- Month-to-date actual spend vs prior month (MoM %)
- Annual run rate based on current pace
- Top cost drivers by Azure service with bar visualization
- 6-month cost trend chart (preliminary vs final data clearly marked)
- Reserved Instance savings summary (PAYG equivalent vs RI cost vs saving)

#### Reservations Panel

| Sub-tab | What it shows |
|---|---|
| **All RIs** | Every reservation order: SKU, term, quantity, expiry, provisioning state |
| **Utilization** | Used vs reserved hours per reservation with % bar and status |
| **Expiring** | Orders expiring within 90 days with urgency (HIGH/MEDIUM/LOW) and renewal action |
| **Underutilized** | Orders below 80% utilization with estimated monthly waste and recommended action |

#### RI Buy Guide
- Azure Advisor RI purchase recommendations ranked by annual savings
- Per-recommendation: SKU, region, term, quantity, current PAYG vs RI cost, monthly/annual saving
- Recommended scope (Shared vs Single subscription)
- Exact action text (what to click in Azure Portal)
- Filterable by 1-year vs 3-year term

#### Azure Compute Savings Plan Analysis
- CSP recommendations from the Consumption Benefits API
- Recommended hourly commitment amount and savings %
- All-term comparison table (1yr vs 3yr)
- RI vs CSP decision matrix

#### FinOps Detail Dashboard

| View | Grouping |
|---|---|
| **By Service** | Cost split across Azure service names with % |
| **By Resource Group** | Cost by RG — identifies uncontrolled spend |
| **By Tag** | Configurable tag key with tag coverage % |
| **By Subscription** | Per-subscription split (MG scope required) |
| **Budgets** | Active budgets with spend bars, ON_TRACK/AT_RISK/EXCEEDED |
| **Optimization** | All Advisor cost recommendations ranked by annual savings |

#### Temporal Source Attribution
Every API response carries `_temporal` metadata:
- `dataVintage`: PRELIMINARY (current month, 24-48h lag) / PENDING_FINAL / FINAL
- `billingPeriod`: exact start/end dates of the data window
- `ingestionTimestamp`: when this server fetched the data
- `warnings[]`: contextual alerts explaining why numbers may change
- `knownDelays`: documented Azure billing pipeline delays

---

## Architecture

```
Browser (React)
    │
    │  /api/*  (same-origin via Vite proxy in dev, direct in prod)
    ▼
Express Backend (Node.js — YOUR SERVER)
    │  Read-only Azure API calls
    ├──► Azure Cost Management API     (management.azure.com)
    ├──► Azure Reservations API        (management.azure.com)
    ├──► Azure Advisor API             (management.azure.com)
    ├──► Azure Consumption API         (management.azure.com)
    └──► Azure Retail Prices API       (prices.azure.com — public, no auth)
```

No data flows to any third party. Azure credentials never reach the browser.

---

## Azure Access Setup

### Service Principal (local dev / non-Azure hosting)

```bash
# 1. Create App Registration
az ad app create --display-name "AzureCostIQ-Reader"

# 2. Create Service Principal
az ad sp create --id <appId>

# 3. Create client secret (note the value — shown once)
az ad app credential reset --id <appId> --append

# 4. Assign roles at Tenant Root Management Group
TENANT_MG="/providers/Microsoft.Management/managementGroups/<tenantId>"
SP_OBJECT_ID="<spObjectId>"

for ROLE in "Cost Management Reader" "Reservations Reader" "Management Group Reader" "Reader"; do
  az role assignment create --assignee "$SP_OBJECT_ID" --role "$ROLE" --scope "$TENANT_MG"
done
```

### Required RBAC Roles

| Role | Why needed |
|---|---|
| `Cost Management Reader` | Read actual costs, budgets, usage |
| `Reservations Reader` | View reservation orders, utilization, savings |
| `Management Group Reader` | List management group hierarchy |
| `Reader` | View resource metadata |

> All roles are read-only. The SP cannot create, modify, or delete any Azure resources.

### Managed Identity (Azure App Service)

When deployed to Azure App Service with system-assigned managed identity, leave `AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET` blank. The SDK uses the managed identity automatically.

```bash
# Get App Service managed identity object ID
OBJECT_ID=$(az webapp identity show \
  --name <app-name> --resource-group <rg> --query principalId -o tsv)

# Assign same four roles to the managed identity
for ROLE in "Cost Management Reader" "Reservations Reader" "Management Group Reader" "Reader"; do
  az role assignment create --assignee "$OBJECT_ID" --role "$ROLE" \
    --scope "/providers/Microsoft.Management/managementGroups/<tenantId>"
done
```

---

## Quick Start — Local Development

```bash
# 1. Install dependencies
npm install

# 2. Configure credentials
cp .env.example .env
# Edit .env: set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, DEFAULT_SCOPE

# 3. Start (Vite frontend + Express backend, hot-reload)
npm run dev
```

Open **http://localhost:3000**

- **Cost Estimator tab** — works without Azure credentials
- **Live Analyzer tab** — requires valid credentials and RBAC roles

---

## Self-Hosting — Docker

```bash
cp .env.example .env
# Edit .env with Azure credentials

docker-compose up -d

# Health check
curl http://localhost:8080/api/health
```

Available at **http://localhost:8080**

---

## Deploy to Azure App Service

### Container deployment (recommended)

```bash
# Build and push to ACR
az acr build --registry <acr-name> --image azure-cost-iq:v4 .

# Create App Service Plan
az appservice plan create \
  --name plan-cost-iq --resource-group <rg> \
  --sku P1V3 --is-linux

# Create Web App
az webapp create \
  --name azure-cost-iq --resource-group <rg> \
  --plan plan-cost-iq \
  --deployment-container-image-name <acr-name>.azurecr.io/azure-cost-iq:v4

# Enable managed identity
az webapp identity assign --name azure-cost-iq --resource-group <rg>
# Get the principalId and assign RBAC roles (see Azure Access Setup above)

# App settings (no credentials needed — managed identity)
az webapp config appsettings set \
  --name azure-cost-iq --resource-group <rg> \
  --settings \
    NODE_ENV=production \
    PORT=8080 \
    DEFAULT_SCOPE="/providers/Microsoft.Management/managementGroups/<tenantId>"
```

### Private endpoint (VNet-isolated deployment)

```bash
# VNet integration
az webapp vnet-integration add \
  --name azure-cost-iq --resource-group <rg> \
  --vnet <vnet-name> --subnet <subnet-name>

# Disable public access
az webapp update \
  --name azure-cost-iq --resource-group <rg> \
  --set publicNetworkAccess=Disabled

# Add private endpoint
az network private-endpoint create \
  --name pe-azure-cost-iq --resource-group <rg> \
  --vnet-name <vnet-name> --subnet <subnet-name> \
  --private-connection-resource-id <app-service-id> \
  --group-id sites --connection-name conn-azure-cost-iq
```

---

## API Reference

| Endpoint | Description |
|---|---|
| `GET /api/health` | Server status, Azure auth status |
| `GET /api/scope/options` | List available MGs and subscriptions |
| `GET /api/scope/validate?scope=` | Validate credential has access to a scope |
| `GET /api/costs/summary?scope=` | MTD spend + prior month comparison |
| `GET /api/costs/trend?scope=&months=6` | Month-over-month trend |
| `GET /api/costs/by-service?scope=` | Cost grouped by Azure service name |
| `GET /api/costs/by-resource-group?scope=` | Cost grouped by resource group |
| `GET /api/costs/by-tag?scope=&tagKey=Environment` | Cost grouped by tag value |
| `GET /api/costs/by-subscription?scope=` | Cost per subscription (MG scope) |
| `GET /api/costs/budgets?scope=` | Active budgets and spend vs budget |
| `GET /api/reservations` | All reservation orders |
| `GET /api/reservations/usage?scope=` | Utilization % per reservation |
| `GET /api/reservations/savings?scope=` | PAYG equivalent vs RI cost vs saving |
| `GET /api/reservations/expiring?days=90` | RIs expiring within N days |
| `GET /api/reservations/underutilized?scope=` | RIs below 80% utilization |
| `GET /api/recommendations/ri?scope=&term=P1Y` | RI purchase recommendations |
| `GET /api/recommendations/csp?scope=&term=P1Y` | Savings Plan recommendations |
| `GET /api/recommendations/all?scope=` | All Advisor cost recommendations |
| `GET /api/prices?...` | Proxy to Azure Retail Prices API |

---

## Temporal Source Attribution — Data Vintage

Every response includes `_temporal`:

```json
{
  "_temporal": {
    "requestedAt": "2026-05-21T14:30:00Z",
    "billingPeriod": { "start": "2026-05-01", "end": "2026-05-31", "status": "PRELIMINARY" },
    "dataVintage": "PRELIMINARY",
    "staleness": "24-48 hours",
    "warnings": ["Current period spend is 24-48h behind actual consumption"],
    "knownDelays": {
      "costManagementExport": "24-48 hours behind real-time spend",
      "riAmortizationRecalc": "Up to 48h after period close",
      "marketplaceCharges": "Up to 7 days delay"
    }
  }
}
```

| Vintage | When | Meaning |
|---|---|---|
| `PRELIMINARY` | Current billing period | 24-48h behind. Changes daily. |
| `PENDING_FINAL` | Period closed < 72h | RI amortization may still be recalculated. |
| `FINAL` | Period closed > 72h | Stable. EA/MCA credits may still apply. |

---

## Data Security

| Concern | Handling |
|---|---|
| Azure credentials in browser | Never. Credentials only exist in backend env vars. |
| Data to third parties | None. All calls go to `management.azure.com` (read-only) and `prices.azure.com` (public). |
| Billing data cached | Not persisted. Fresh per request. |
| Public access | Optional: deploy behind private endpoint with VNet integration. |
| CSP headers | Production mode enforces same-origin Content-Security-Policy. |

---

## File Structure

```
azure-cost-iq/
├── App.jsx                    # Cost Estimator (28-service slider estimator)
├── LiveAnalysis.jsx           # Live Analyzer (RI, CSP, executive + FinOps dashboards)
├── index.html                 # HTML entry point
├── vite.config.js             # Vite config + /api proxy
├── package.json
│
├── src/
│   └── main.jsx               # React root — tab bar wrapping both components
│
├── server/
│   ├── index.js               # Express backend + static serving
│   ├── auth.js                # Azure credential factory (SP / MI / DefaultAzureCredential)
│   ├── middleware/
│   │   └── temporal.js        # Temporal source attribution middleware
│   └── routes/
│       ├── scope.js           # Management group / subscription discovery
│       ├── reservations.js    # RI list, usage, savings, expiring, underutilized
│       ├── costs.js           # Cost Management queries
│       └── recommendations.js # RI + CSP + Advisor recommendations
│
├── .env.example               # Credential template
├── Dockerfile                 # Multi-stage Node 20 alpine build
└── docker-compose.yml         # Self-hosted production deployment
```

---

## Enterprise Use Cases

| Use Case | Tab | Feature |
|---|---|---|
| Pre-project budget | Cost Estimator | Sliders → copy cost memo |
| Monthly FinOps review | Live → FinOps Detail | Cost by service, budgets |
| RI renewal planning | Live → Reservations → Expiring | 90-day expiry list |
| RI utilization review | Live → Reservations → Utilization | Usage % + underutilized waste |
| Where to buy new RIs | Live → RI Buy Guide | Advisor ranked recommendations |
| CSP vs RI decision | Live → Savings Plans | Comparison + recommendations |
| Executive cost report | Live → Executive Overview | KPI cards + trend |
| Tag compliance | Live → FinOps → By Tag | Coverage % + untagged spend |
| Optimization backlog | Live → FinOps → Optimization | Advisor ranked by $ |
| Multi-subscription showback | Live → FinOps → By Subscription | Cost per subscription |

---

## Troubleshooting

**"Azure connection failed"**
- Check `/api/health` for `azure.authValid`
- Verify all three env vars: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`
- Confirm RBAC roles are assigned at the correct scope

**"No reservations found"**
- `Reservations Reader` must be assigned at tenant root MG or billing enrollment scope, not subscription

**Cost data shows $0**
- Cost Management has 24-48h lag for new scopes
- Verify the SP has `Cost Management Reader` on the queried scope

**Savings Plan recommendations empty**
- Requires MCA or EA billing account (not PAYG)
- Requires 30+ days of compute usage history

**App Service blank page**
- Run `npm run build` and verify `dist/` exists before deploying
- Check `NODE_ENV=production` is set

---

*AzureCostIQ v4.0 · MIT License · All Azure API calls are read-only · No data leaves your environment*
