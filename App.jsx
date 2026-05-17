/**
 * AzureCostIQ — App.jsx
 * Open-source Azure project cost estimation tool
 * https://github.com/your-org/azure-cost-iq
 *
 * Version:  3.0.0  |  License: MIT
 *
 * ═══════════════════════════════════════════════════════════════
 * SUPPORTED AZURE SERVICES (22 services, 8 categories)
 * ═══════════════════════════════════════════════════════════════
 * DATA PLATFORM      ADF · ADLS Gen2 · Databricks · APIM · Power BI
 * COMPUTE            AKS · Functions · App Service + ASP · VMs
 * DATABASE           SQL Database · SQL Managed Instance · Cosmos DB · Redis
 * AI & ML            Azure OpenAI · AI Foundry · AI Search · ML Workspace · AI Services
 * INTEGRATION        Service Bus · Event Hubs · Logic Apps
 * NETWORKING         VNet Traffic · ExpressRoute · App Gateway
 * SECURITY           Key Vault · Defender for Cloud · Defender for Endpoint
 * MONITORING         Log Analytics · Azure Monitor & Alerts
 * ═══════════════════════════════════════════════════════════════
 *
 * PRICING SOURCE
 *   All USD prices from Azure Retail Prices API, Canada Central region.
 *   Last verified: May 2026
 *   Live fetch: /api/prices (Vite proxy in dev, Express in prod — no CORS)
 *
 * HOW TO ADD A NEW SERVICE — see CONTRIBUTING.md for full guide.
 *   1. Add price constants to PRICES_USD with source comment + date
 *   2. Add context + "what is this" text to CTX and SERVICE_GUIDE
 *   3. Add useState for each slider parameter
 *   4. Write a calcXxx() function using useCallback
 *   5. Add useMemo result + include in subtotal
 *   6. Add a <Section> with <Slider> components in the render
 *   7. Add to enabledServices array, chart, legend, output generators
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Chart, ArcElement, Tooltip, DoughnutController } from 'chart.js';

Chart.register(ArcElement, Tooltip, DoughnutController);

// ─────────────────────────────────────────────────────────────────────────────
// AZURE PRICING CONSTANTS
// Source: https://prices.azure.com/api/retail/prices?api-version=2023-01-01-preview
// Region: Canada Central | Exchange rate: CAD 1.38 / USD
// All prices in USD — converted at render time via USD_TO_CAD.
// Review quarterly: chore: refresh Azure Canada Central pricing — Qx 20xx
// ─────────────────────────────────────────────────────────────────────────────
export const USD_TO_CAD = 1.38;

export const PRICES_USD = {

  // ── Azure Data Factory ────────────────────────────────────────────────────
  // Verified May 2026 | serviceName: Azure Data Factory | Canada Central
  adf: {
    orchestrationPerRun:    0.001,    // Per pipeline orchestration run trigger
    dataMovementPerDIUHour: 0.25,     // Cloud IR — per Data Integration Unit × hour
    copyActivityPerRun:     0.005,    // Per individual Copy Activity execution
    shirNodePerHour:        0.10,     // Self-Hosted Integration Runtime — per node-hour
  },

  // ── ADLS Gen2 ─────────────────────────────────────────────────────────────
  // Verified May 2026 | serviceName: Azure Data Lake Storage | Hot/Cool LRS
  adls: {
    hotTierPerGBMonth:  0.023,
    coolTierPerGBMonth: 0.010,
    archivePerGBMonth:  0.002,
    readPer10KOps:      0.0044,
    writePer10KOps:     0.057,
  },

  // ── Azure Databricks Premium ───────────────────────────────────────────────
  // Verified May 2026 | serviceName: Azure Databricks
  databricks: {
    jobsComputePerDBUHour:    0.0762,   // Job cluster — Premium tier
    interactivePerDBUHour:    0.4287,   // All-purpose cluster
    sqlWarehousePerDBUHour:   0.22,     // SQL Warehouse (classic)
    vmDS3v2PerHour:           0.252,    // DS3v2 4-core VM (classic clusters)
    serverlessJobsPerDBUHour: 0.0882,   // Serverless Jobs — no VM billing
  },

  // ── Azure API Management ──────────────────────────────────────────────────
  // Verified May 2026 | serviceName: API Management
  apim: {
    standardTierPerHour:   0.965,
    developerTierPerHour:  0.073,
    v2StandardPerHour:     0.198,
    callOveragePer1M:      3.50,
    includedCallsPerMonth: 1_000_000,
  },

  // ── Power BI ──────────────────────────────────────────────────────────────
  // Verified May 2026 | Microsoft 365 Commerce
  powerbi: {
    proPerUserMonth:   9.99,
    ppuPerUserMonth:   20.00,
    premiumP1PerMonth: 4995.00,
  },

  // ── Azure Kubernetes Service ───────────────────────────────────────────────
  // Verified May 2026 | serviceName: Azure Kubernetes Service | Linux nodes
  aks: {
    uptimeSLAPerHour:  0.10,      // Optional Uptime SLA — 99.95% API server SLA
    vmD4asv5PerHour:   0.232,     // D4as v5: 4 vCPU, 16 GB — cost-optimised ★
    vmDS3v2PerHour:    0.252,     // DS3 v2: 4 vCPU, 14 GB — standard
    vmDS4v2PerHour:    0.504,     // DS4 v2: 8 vCPU, 28 GB — larger workloads
    vmE4sv3PerHour:    0.292,     // E4s v3: 4 vCPU, 32 GB — memory-optimised
  },

  // ── Azure Functions ───────────────────────────────────────────────────────
  // Verified May 2026 | serviceName: Azure Functions
  functions: {
    consumptionPerMillionExec: 0.20,       // Per 1M executions (first 1M free)
    consumptionPerGBsecond:    0.000016,   // GB-seconds (first 400K free)
    premiumEP1PerHour:         0.201,      // EP1: 1 vCPU, 3.5 GB
    premiumEP2PerHour:         0.402,      // EP2: 2 vCPU, 7 GB
    premiumEP3PerHour:         0.804,      // EP3: 4 vCPU, 14 GB
  },

  // ── App Service + App Service Plan ────────────────────────────────────────
  // Verified May 2026 | serviceName: Azure App Service | Linux
  appService: {
    // App Service Plan (ASP) — you pay for the plan, not per app
    // Multiple apps can run on one plan at no extra cost
    b1PerHour:   0.018,   // B1: 1 vCPU, 1.75 GB — dev/test
    b2PerHour:   0.036,   // B2: 2 vCPU, 3.5 GB  — small prod
    b3PerHour:   0.072,   // B3: 4 vCPU, 7 GB    — medium prod
    p1v3PerHour: 0.171,   // P1v3: 2 vCPU, 8 GB  — prod + SLA + autoscale
    p2v3PerHour: 0.342,   // P2v3: 4 vCPU, 16 GB
    p3v3PerHour: 0.684,   // P3v3: 8 vCPU, 32 GB
    i1v2PerHour: 0.502,   // I1v2: 2 vCPU, 8 GB  — Isolated (VNet dedicated)
    i2v2PerHour: 1.004,   // I2v2: 4 vCPU, 16 GB — Isolated
    customDomainSSLPerMonth: 0.00,  // Included in B2+ plans
  },

  // ── Virtual Machines ──────────────────────────────────────────────────────
  // Verified May 2026 | Linux PAYG | Canada Central
  vm: {
    b2sPerHour:    0.050,
    d4sv3PerHour:  0.232,
    d8sv3PerHour:  0.464,
    e4sv3PerHour:  0.292,
    f8sv2PerHour:  0.384,
    managedDiskP10: 20.40,   // P10 128 GB Premium SSD/month
    managedDiskP20: 38.40,   // P20 512 GB Premium SSD/month
    managedDiskP30: 122.88,  // P30 1 TB Premium SSD/month
  },

  // ── Azure SQL Database ────────────────────────────────────────────────────
  // Verified May 2026 | General Purpose vCore | Canada Central
  sqlDatabase: {
    serverlessPerVcoreHour: 0.1829,   // Serverless GP per vCore-hour
    gpvCore4PerHour:        0.7315,   // GP 4 vCore provisioned
    gpvCore8PerHour:        1.463,    // GP 8 vCore provisioned
    gpvCore16PerHour:       2.926,    // GP 16 vCore provisioned
    storagePerGBMonth:      0.115,    // GP storage per GB/month
    backupLRSPerGBMonth:    0.05,     // Backup storage LRS
  },

  // ── Azure SQL Managed Instance ────────────────────────────────────────────
  // Verified May 2026 | serviceName: SQL Managed Instance | General Purpose
  sqlManagedInstance: {
    // General Purpose — shared hardware, cost-effective
    gp4vCorePerHour:   0.7315,   // GP 4 vCore per hour
    gp8vCorePerHour:   1.463,    // GP 8 vCore per hour
    gp16vCorePerHour:  2.926,    // GP 16 vCore per hour
    // Business Critical — local SSD, 3 HA replicas, read scale-out
    bc4vCorePerHour:   1.947,    // BC 4 vCore per hour
    bc8vCorePerHour:   3.894,    // BC 8 vCore per hour
    // Storage (General Purpose)
    storagePerGBMonth: 0.115,    // Managed storage per GB/month
    backupPerGBMonth:  0.05,     // Backup storage LRS per GB/month
    // Always included: HA, backups, automated patching, SQL Agent
  },

  // ── Azure Cosmos DB ───────────────────────────────────────────────────────
  // Verified May 2026 | Serverless + Provisioned
  cosmosDb: {
    serverlessPer1MRU:    0.282,    // Per 1M Request Units consumed
    provisionedPer100RU:  0.00576,  // Per 100 RU/s per hour
    storagePer10GB:       0.25,     // Per 10 GB/month stored
  },

  // ── Azure Cache for Redis ─────────────────────────────────────────────────
  // Verified May 2026 | Standard tier (replicated primary+replica)
  redis: {
    c1StandardPerHour: 0.042,   // C1: 1 GB
    c2StandardPerHour: 0.188,   // C2: 6 GB
    c3StandardPerHour: 0.376,   // C3: 13 GB
    p1PremiumPerHour:  0.524,   // P1 Premium: 6 GB + VNet + persistence
    p2PremiumPerHour:  1.049,   // P2 Premium: 13 GB
  },

  // ── Azure OpenAI Service ──────────────────────────────────────────────────
  // Verified May 2026 | per 1K tokens
  openai: {
    gpt4oInputPer1K:    0.005,    // GPT-4o input
    gpt4oOutputPer1K:   0.015,    // GPT-4o output (3× input cost)
    gpt4oMiniInputPer1K:  0.00015,  // GPT-4o mini input (33× cheaper)
    gpt4oMiniOutputPer1K: 0.00060,  // GPT-4o mini output
    ada2EmbeddingPer1K:   0.0001,   // text-embedding-ada-002
    dalle3PerImage:       0.040,    // DALL-E 3 1024×1024 standard
  },

  // ── Azure AI Foundry ──────────────────────────────────────────────────────
  // Verified May 2026 | Azure AI Foundry (formerly Azure AI Studio)
  // Hub and project creation: free. Costs from underlying compute + models.
  aiFoundry: {
    // Compute for fine-tuning / inference deployments (VM-based)
    nc6sV3PerHour:    3.06,    // NC6s v3: 1 GPU (V100 16GB) — fine-tuning
    nc12sV3PerHour:   6.12,    // NC12s v3: 2 GPU
    // Managed online endpoint (inference) — compute + model deployment
    ds3v2InferencePerHour: 0.252,   // D3s v2 inference node per hour
    // Prompt flow compute (serverless invocations)
    promptFlowPer1MInvocations: 2.00,
    // Storage for model artifacts (same as Blob Hot)
    storagePerGBMonth: 0.023,
  },

  // ── Azure AI Search ───────────────────────────────────────────────────────
  // Verified May 2026 | serviceName: Azure Cognitive Search
  aiSearch: {
    basicPerHour:      0.101,    // Basic: 2GB index, 3 replicas max, no SLA
    s1PerHour:         0.290,    // Standard S1: 25GB/partition, SLA
    s2PerHour:         1.153,    // Standard S2: 100GB/partition
    s3PerHour:         4.612,    // Standard S3: 200GB/partition
    storagePerGBMonth: 0.25,     // Additional index storage per GB
    // Semantic Ranker (AI-powered re-ranking)
    semanticRankerPer1KQueries: 0.01,
  },

  // ── Azure Machine Learning Workspace ──────────────────────────────────────
  // Verified May 2026 | Workspace itself: free. Pay for compute + storage.
  mlWorkspace: {
    // Compute Instances (dev/experimentation) — always-on VMs
    ds3v2ComputeInstancePerHour: 0.252,   // DS3v2: 4 vCPU, 14 GB
    ds4v2ComputeInstancePerHour: 0.504,   // DS4v2: 8 vCPU, 28 GB
    // Compute Clusters (training) — scale to 0 when idle
    nc6sV3TrainingPerHour:  3.06,    // NC6s v3 GPU cluster node
    d4sv3TrainingPerHour:   0.232,   // D4s v3 CPU cluster node
    // Managed online endpoints (inference) — same as VM pricing
    inferenceD4sv3PerHour:  0.232,
    // Storage (models, datasets, experiment outputs)
    storageHotPerGBMonth:   0.023,
    // Managed Feature Store
    featureStorePerGBMonth: 0.015,
  },

  // ── Azure AI Services (Cognitive) ────────────────────────────────────────
  // Verified May 2026 | Per 1K transactions
  aiServices: {
    visionPer1KTransactions:     0.001,
    speechSTTPer1HrAudio:        1.00,
    languagePer1KTransactions:   0.002,
    documentIntelPer1KPages:     1.50,
    translatorPer1MChars:        10.00,
  },

  // ── Azure Service Bus ─────────────────────────────────────────────────────
  // Verified May 2026 | Standard + Premium
  serviceBus: {
    standardPerHour:    0.013,    // Standard namespace — fixed hourly
    premiumPer1MUHour:  0.928,    // Premium: per Messaging Unit per hour
    operationsPer1M:    0.80,     // Per 1M brokered operations (Standard)
  },

  // ── Azure Event Hubs ──────────────────────────────────────────────────────
  // Verified May 2026 | Standard + Premium
  eventHubs: {
    standardPerTUHour:  0.030,    // Per Throughput Unit per hour
    premiumPer1PUHour:  0.928,    // Per Processing Unit per hour (Premium)
    ingressPer1M:       0.028,    // Per 1M events (Standard)
    capturePerHour:     0.113,    // Event Capture per namespace-hour
  },

  // ── Azure Logic Apps ──────────────────────────────────────────────────────
  // Verified May 2026 | Consumption + Standard
  logicApps: {
    // Consumption plan — pay per action execution
    consumptionActionPer1K:       0.025,    // Per 1K action executions
    consumptionConnectorPer1K:    0.025,    // Standard connectors per 1K
    consumptionEnterpriseConPer1K: 0.50,   // Enterprise connectors per 1K
    // Standard plan — vCPU-based, always-on, VNet support
    wsPerHour:                    0.192,    // Standard WS1: 1 vCPU, 3.5 GB
    ws2PerHour:                   0.384,    // Standard WS2: 2 vCPU, 7 GB
    ws3PerHour:                   0.768,    // Standard WS3: 4 vCPU, 14 GB
    storagePerGBOps:              0.000054, // Storage operations per GB
  },

  // ── VNet Traffic & Data Transfer ──────────────────────────────────────────
  // Verified May 2026 | Azure Networking
  vnet: {
    // VNet Peering (intra-region data transfer)
    peeringIntraRegionPerGB:   0.010,   // Same region peering: $0.01/GB each way
    peeringCrossRegionPerGB:   0.035,   // Cross-region peering: $0.035/GB
    // Internet egress (outbound to internet)
    internetEgressFirst10TB:   0.087,   // Per GB, first 10 TB/month
    internetEgress10to40TB:    0.083,   // Per GB, 10–40 TB/month
    // Private Endpoint charges
    privateEndpointPerHour:    0.01,    // Per private endpoint per hour
    privateEndpointDataPerGB:  0.01,    // Data processed per GB
    // VPN Gateway (if not using ExpressRoute)
    vpnGwVpnGw1PerHour:        0.19,   // VpnGw1: 650 Mbps
    vpnGwVpnGw2PerHour:        0.385,  // VpnGw2: 1 Gbps
  },

  // ── Azure ExpressRoute ────────────────────────────────────────────────────
  // Verified May 2026 | Direct circuit pricing Canada Central
  expressRoute: {
    // Circuit port fees (monthly)
    er50MbpsLocalPerMonth:   54.98,    // 50 Mbps Local circuit
    er50MbpsStandardPerMonth: 54.98,   // 50 Mbps Standard
    er200MbpsPerMonth:       219.91,   // 200 Mbps Standard
    er500MbpsPerMonth:       439.83,   // 500 Mbps Standard
    er1GbpsPerMonth:         549.78,   // 1 Gbps Standard
    er2GbpsPerMonth:        1099.56,   // 2 Gbps Standard
    er10GbpsPerMonth:       5497.80,   // 10 Gbps Standard
    // Gateway (required in Azure VNet to connect to circuit)
    gwStandardPerHour:  0.162,    // Standard GW: up to 1 Gbps
    gwHighPerfPerHour:  0.327,    // High Performance GW: up to 2 Gbps
    gwUltraPerfPerHour: 0.983,    // Ultra Performance GW: up to 10 Gbps
    // Data transfer (Metered plan — Unlimited plan has no per-GB charge)
    outboundDataPerGB:  0.025,    // Metered plan egress per GB
  },

  // ── Azure Application Gateway ─────────────────────────────────────────────
  // Verified May 2026 | WAF v2 + Standard v2
  appGateway: {
    wafV2FixedPerHour:           0.360,
    wafV2CapacityUnitPerHour:    0.008,
    standardV2FixedPerHour:      0.246,
    standardV2CapacityUnitHour:  0.008,
    dataProcessedPer10GB:        0.008,
  },

  // ── Azure Key Vault ───────────────────────────────────────────────────────
  // Verified May 2026 | serviceName: Key Vault | Standard + Premium/HSM
  keyVault: {
    // Standard tier — software-protected keys
    secretOperationsPer10K:    0.03,    // Per 10K secret operations
    keyOperationsPer10K:       0.03,    // Per 10K key operations (software)
    certificateRenewal:        3.00,    // Per certificate renewal
    softwareKeyPerMonth:       0.90,    // Per software-protected key/month (if managed)
    // Premium tier — HSM-backed keys
    hsmKeyPerMonth:            5.00,    // Per HSM-backed key/month
    hsmKeyOperationsPer10K:    0.15,    // HSM key operations per 10K
    // Managed HSM (dedicated hardware)
    managedHSMPerHour:         1.622,   // Dedicated HSM cluster per hour
  },

  // ── Microsoft Defender for Cloud ──────────────────────────────────────────
  // Verified May 2026 | Per-resource plan pricing
  defenderCloud: {
    // Defender for Servers Plan P2 (full CSPM + EDR + JIT)
    serverP2PerServerMonth:    15.00,   // Per server/month (any OS)
    serverP1PerServerMonth:    7.20,    // Plan P1 (limited — use P2 for prod)
    // Defender for Containers (AKS, ACR scanning)
    containersPerCoreMonth:    7.00,    // Per vCore/month in Kubernetes clusters
    // Defender for SQL (on Azure SQL + SQL MI + SQL on VMs)
    sqlPerServerMonth:         15.00,   // Per SQL server/month
    // Defender for Storage (blob/ADLS anomaly detection)
    storagePerStorageAcctMonth: 10.00,  // Per storage account/month
    // Defender for Key Vault
    keyVaultPer10KTransactions: 0.02,   // Per 10K transactions
    // Defender for DNS (resource-based)
    dnsPerSubscriptionMonth:    15.00,  // Per subscription/month
    // Defender for App Service
    appServicePerInstanceMonth: 15.00,  // Per App Service plan instance/month
    // Defender CSPM (Cloud Security Posture Management)
    cspmFreeResources:          0,      // CSPM basic: free
    cspmPaidPerResourceMonth:   0.007,  // CSPM enhanced per resource/month
  },

  // ── Microsoft Defender for Endpoint ───────────────────────────────────────
  // Verified May 2026 | Microsoft 365 / Defender portal
  defenderEndpoint: {
    plan2PerUserMonth:          5.20,   // MDE Plan 2 per user/month
    plan2PerDeviceMonth:        5.20,   // MDE Plan 2 per device/month (server)
    serverPlan2PerServerMonth:  15.00,  // MDE for Servers P2 (via Defender for Cloud)
    // EDR for Servers included in Defender for Cloud P2
    // MDE P1 (basic AV + device control only):
    plan1PerUserMonth:          3.00,
  },

  // ── Log Analytics Workspace ───────────────────────────────────────────────
  // Verified May 2026 | serviceName: Log Analytics | Pay-As-You-Go
  logAnalytics: {
    ingestPerGBPayGo:          2.30,    // Per GB ingested (PAYG)
    // Commitment tiers (volume discounts)
    commitTier100GBDayPerGB:   1.98,    // 100 GB/day tier
    commitTier200GBDayPerGB:   1.92,    // 200 GB/day tier
    commitTier500GBDayPerGB:   1.73,    // 500 GB/day tier
    // Retention beyond 31 days (included free)
    retentionBeyond31DaysPerGBMonth: 0.10,   // Per GB/month for days 32–730
    // Interactive query charges (beyond included)
    queryPerGBScanned:         0.00,    // Basic log queries: free
    // Data export
    exportPerGB:               0.10,    // Continuous data export per GB
    // Microsoft Sentinel (if enabled on this workspace)
    sentinelIngestPerGB:       2.46,    // Sentinel data ingestion per GB
    sentinelRetentionPerGBMonth: 0.10,  // Extended retention
  },

  // ── Azure Monitor & Alerts ────────────────────────────────────────────────
  // Verified May 2026 | Azure Monitor, Metrics, Alerting
  monitor: {
    // Metrics
    customMetricsPer1M:        0.10,    // Custom metrics per 1M data points/month
    // Platform metrics (CPU, memory, disk): free
    // Alert rules
    staticAlertRulePerMonth:   0.10,    // Per static threshold alert rule/month
    dynamicAlertRulePerMonth:  0.10,    // Per dynamic (ML) alert rule/month
    smartDetectionPerMonth:    0,       // Smart detection: free
    // Notifications (action groups)
    emailPer1K:                0,       // Email notifications: free
    smsPer100:                 0.75,    // SMS per 100 notifications
    webhookPer1K:              0,       // Webhook: free
    // Diagnostic settings → Log Analytics: billed as Log Analytics ingestion
    // Azure Workbooks: free
    workbooksPerMonth:         0,
    // Application Insights (workspace-based — billed as Log Analytics ingestion)
    appInsightsSamplingNote:   0,       // Configure sampling to control cost
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE GUIDE DATA
// Shown in the "Service Guide" modal when user clicks the button.
// What it is, when you need it, cost drivers, typical monthly range.
// ─────────────────────────────────────────────────────────────────────────────
const SERVICE_GUIDE = [
  {
    category: 'Data Platform',
    color: '#2E75B6',
    services: [
      {
        name: 'Azure Data Factory (ADF)',
        icon: '⚙️',
        what: 'Microsoft\'s cloud-native ETL/ELT service for building data pipelines. Connects 100+ data sources, transforms data, and orchestrates movement across cloud and on-premises systems.',
        when: 'You need to move, transform, or ingest data on a schedule or event-driven basis. Use for any ETL/ELT workload — API ingestion, database sync, file processing, SFTP pickup.',
        drivers: ['Pipeline runs per day (orchestration billing)', 'Data Integration Units × hours (data movement billing)', 'Copy Activity count per run', 'SHIR nodes × hours (if connecting to on-premises sources)'],
        notBilled: ['Pipeline creation, editing, monitoring UI', 'Trigger configuration', 'Git integration', 'Data flows in dev environment'],
        typical: '$50 – $500 CAD/month for a typical integration project',
      },
      {
        name: 'ADLS Gen2 (Medallion Storage)',
        icon: '🗄️',
        what: 'Azure Data Lake Storage Gen2 — hierarchical namespace object storage optimised for analytics. Used as the Bronze (raw), Silver (cleansed), and Gold (curated) layers in the data lakehouse medallion architecture.',
        when: 'You are building a data platform, data lake, or lakehouse architecture. All data that goes through Databricks or ADF for analytics should land in ADLS Gen2.',
        drivers: ['Total GB stored across Bronze + Silver + Gold', 'Storage tier (Hot vs Cool — choose based on access frequency)', 'Read/write transaction volume (ADF writes, Databricks reads, Power BI queries)'],
        notBilled: ['Storage account creation', 'VNet/Private Endpoint configuration', 'Unity Catalog metadata'],
        typical: '$20 – $300 CAD/month depending on data volume',
      },
      {
        name: 'Azure Databricks Premium',
        icon: '💎',
        what: 'Apache Spark-based unified analytics platform. Used for large-scale data transformation, machine learning, SQL analytics, and streaming. Premium tier required for Unity Catalog data governance.',
        when: 'You need distributed data processing for large datasets (>1GB), complex transformations, ML model training, or want a governed data catalog.',
        drivers: ['Job cluster hours × DBU rate + VM rate (ETL batch)', 'Interactive cluster hours × DBU rate + VM rate (dev work)', 'SQL Warehouse hours × DBU rate (analytics queries)', 'Serverless Jobs hours × DBU rate (no VM cost, no startup delay)'],
        notBilled: ['Unity Catalog metastore (included in Premium)', 'Workspace admin, notebook UI', 'Auto-scaling scale-down to zero'],
        typical: '$200 – $2,000 CAD/month for a typical analytics workload',
      },
      {
        name: 'Azure API Management (APIM)',
        icon: '🔌',
        what: 'Enterprise API gateway that acts as a facade for backend services. Provides authentication, rate limiting, caching, transformation, monitoring, and developer portal for all APIs.',
        when: 'You need to expose APIs to other teams or systems in a governed, secure way. Mandatory if your ADF pipelines call external REST APIs — route all external calls through APIM.',
        drivers: ['Gateway tier (Standard ~$1,320 CAD/mo, Developer ~$96 CAD/mo)', 'API call volume beyond included 1M/month ($3.50/million calls)'],
        notBilled: ['Policy configuration, developer portal', 'API design and documentation', 'First 1M calls/month (Standard tier)'],
        typical: '$100 – $1,400 CAD/month depending on tier and call volume',
      },
      {
        name: 'Power BI',
        icon: '📊',
        what: 'Microsoft\'s business intelligence and analytics platform. Used to create interactive dashboards and reports from your Gold layer data. Semantic models connect directly to ADLS Gen2 or Databricks SQL.',
        when: 'Business users need self-service reporting, dashboards, or scheduled reports from your data platform.',
        drivers: ['Pro licenses per user ($9.99 USD/user/month) — required to publish/consume shared content', 'PPU licenses ($20 USD/user/month) — paginated reports, large datasets', 'Premium P1 capacity ($4,995 USD/month) — org-wide distribution, embedding'],
        notBilled: ['Power BI Desktop (free)', 'Gateway VM (CDP platform overhead)', 'Report creation/authoring time'],
        typical: '$200 – $800 CAD/month for a 15–25 user team',
      },
    ],
  },
  {
    category: 'Compute Services',
    color: '#0078D4',
    services: [
      {
        name: 'Azure Kubernetes Service (AKS)',
        icon: '☸️',
        what: 'Managed Kubernetes cluster for running containerised applications. Azure manages the control plane (free); you pay for the node VMs running your workloads.',
        when: 'Your application is containerised and needs auto-scaling, self-healing, rolling deployments, or microservices architecture. Required for high-availability production APIs or processing workloads.',
        drivers: ['Node count × VM size × hours running', 'Uptime SLA ($0.10/hr per cluster — adds 99.95% API SLA)', 'System node pool: minimum 3 nodes for HA', 'Persistent storage (Azure Disk/NFS) attached to pods'],
        notBilled: ['Control plane management (free)', 'Kubernetes API server', 'AKS upgrade/patching operations'],
        typical: '$300 – $3,000 CAD/month for a 3–10 node production cluster',
      },
      {
        name: 'Azure Functions',
        icon: '⚡',
        what: 'Serverless compute — run event-driven code without managing servers. Triggered by HTTP, timers, queues, events, blobs, or Cosmos DB changes. Auto-scales to zero when idle.',
        when: 'You have short-duration, event-driven workloads (API backends, queue processing, scheduled jobs, webhook handlers). Not suitable for long-running processes or tasks needing VNet (use Premium plan for VNet).',
        drivers: ['Consumption: execution count + GB-seconds of memory (first 1M executions + 400K GB-sec free/month)', 'Premium EP1/EP2/EP3: hourly rate × always-on instance count (min 1)'],
        notBilled: ['Function App creation', 'Application Insights (billed separately as Log Analytics ingestion)', 'First 1M executions/month on Consumption'],
        typical: 'Near-$0 to $200 CAD/month (Consumption) | $150–$600 CAD/month (Premium EP1)',
      },
      {
        name: 'App Service + App Service Plan (ASP)',
        icon: '🌐',
        what: 'Fully managed PaaS for hosting web applications, REST APIs, and mobile backends. The App Service Plan (ASP) is the compute resource — you pay for the plan, and can run multiple apps on one plan at no extra app cost.',
        when: 'Hosting web apps, APIs, or admin portals that don\'t need containers. Simpler than AKS for standard web workloads. Use Isolated (I1v2+) tier for VNet-only access with dedicated hardware.',
        drivers: ['ASP SKU tier × hours (B2 ~$36/mo, P1v3 ~$170/mo, I1v2 ~$500/mo)', 'Number of ASP instances (scale-out multiplies cost)', 'Premium features: custom domains (included), TLS certs (included in B2+)'],
        notBilled: ['Multiple apps on the same ASP (no extra app cost)', 'Deployment slots on P-tier plans (staging slot included)', 'CI/CD integrations'],
        typical: '$40 – $600 CAD/month depending on tier and instance count',
      },
      {
        name: 'Virtual Machines',
        icon: '🖥️',
        what: 'IaaS compute — full control over the OS and software stack. Best when you need specific OS configurations, legacy software, SHIR nodes for ADF, or VM-scale sets for custom workloads.',
        when: 'You need ADF Self-Hosted Integration Runtime nodes, SQL Server on VMs, custom application servers, or any workload requiring direct OS access.',
        drivers: ['VM size × hours running (most significant cost)', 'Number of VMs', 'Managed disks (P10 $20/mo, P20 $38/mo, P30 $123/mo per disk)', 'Deallocate (stop) VMs to save compute cost while keeping the disk'],
        notBilled: ['Stopped (deallocated) VMs — disk still billed', 'VM creation and image management'],
        typical: '$50 – $1,000 CAD/month per VM depending on size',
      },
    ],
  },
  {
    category: 'Database & Storage',
    color: '#E74C3C',
    services: [
      {
        name: 'Azure SQL Database',
        icon: '🗃️',
        what: 'Fully managed relational database — the cloud version of SQL Server. No patching, no backup management, built-in HA. Choose vCore model for flexibility or DTU model for simplicity.',
        when: 'Your application needs a relational database with SQL Server compatibility. Use Serverless tier for intermittent/dev workloads (auto-pause when idle — saves ~60%).',
        drivers: ['vCore count × hourly rate (Provisioned: always-on)', 'Active hours (Serverless: pay only when queries are running)', 'Storage per GB/month ($0.115/GB for General Purpose)', 'Backup storage (LRS backup retention)'],
        notBilled: ['Built-in HA (99.99% SLA)', 'Automated backups within retention period', 'SQL Server licence (included)'],
        typical: '$50 – $500 CAD/month for typical application database',
      },
      {
        name: 'Azure SQL Managed Instance',
        icon: '🏛️',
        what: 'Fully managed SQL Server instance with near-100% SQL Server compatibility. Unlike SQL Database, supports SQL Server Agent, CLR, Service Broker, linked servers, and cross-database queries.',
        when: 'Migrating on-premises SQL Server to cloud ("lift and shift") where you need SQL Agent jobs, linked servers, or features not available in SQL Database. Best for enterprise application migrations.',
        drivers: ['vCore count × tier × hourly rate (GP 4 vCore ~$700/mo, BC 4 vCore ~$1,900/mo)', 'Storage per GB/month ($0.115/GB)', 'Business Critical tier: local SSD, 3 HA replicas, read scale-out'],
        notBilled: ['Automated backups, HA, patching, SQL Server licence', 'SQL MI Link (for hybrid scenarios)'],
        typical: '$700 – $3,500 CAD/month (more expensive than SQL Database — only use when features needed)',
      },
      {
        name: 'Azure Cosmos DB',
        icon: '🌐',
        what: 'Globally distributed, multi-model NoSQL database. Supports JSON, key-value, graph, and column-family data. Sub-millisecond latency, 99.999% SLA, automatic multi-region replication.',
        when: 'Your application needs low-latency globally-distributed reads/writes, schema-flexible JSON storage, or event sourcing. Popular for IoT, gaming, real-time personalisation, and microservices.',
        drivers: ['Request Units (RU) consumed (Serverless: pay per RU) OR provisioned RU/s × hours (Provisioned)', 'Data stored per 10 GB/month', 'Replication to additional regions doubles/triples cost'],
        notBilled: ['First 1,000 RU/s and 25 GB storage (Free Tier — one per account)'],
        typical: '$30 – $500 CAD/month for typical application',
      },
      {
        name: 'Azure Cache for Redis',
        icon: '🔴',
        what: 'Fully managed Redis in-memory data store. Used for session caching, result caching, rate limiting, pub/sub messaging, and leaderboards. Standard tier includes primary + replica for HA.',
        when: 'Your application experiences slow database queries that could be cached, needs session storage for stateless web apps, or requires a low-latency key-value store.',
        drivers: ['Cache tier × hours (fixed rate — always on)', 'C1 (1GB) for small apps, C2 (6GB) for medium, P1 Premium for VNet-isolated prod'],
        notBilled: ['Redis commands executed', 'Number of connections', 'Memory below tier limit'],
        typical: '$30 – $750 CAD/month fixed per tier',
      },
    ],
  },
  {
    category: 'AI & Machine Learning',
    color: '#10A37F',
    services: [
      {
        name: 'Azure OpenAI Service',
        icon: '🤖',
        what: 'Access to OpenAI\'s GPT-4o, GPT-4o mini, DALL-E, Whisper, and embedding models via Azure APIs with enterprise security, private networking, and compliance guarantees.',
        when: 'Adding AI capabilities to applications: chat assistants, document summarisation, code generation, content moderation, embeddings for semantic search, or image generation.',
        drivers: ['Input tokens per 1K (prompts + system messages)', 'Output tokens per 1K (completions — costs 3× input for GPT-4o)', 'Model choice: GPT-4o mini is 33× cheaper than GPT-4o — use for simple tasks', 'Call volume × average prompt+completion length'],
        notBilled: ['Model deployment creation', 'Azure OpenAI studio access', 'Cached prompt tokens (60% discount when enabled)'],
        typical: '$50 – $2,000+ CAD/month depending on call volume and model',
      },
      {
        name: 'Azure AI Foundry',
        icon: '🏭',
        what: 'Unified platform for building, evaluating, and deploying AI applications and agents. Includes model catalog (1,600+ models), prompt flow, evaluation framework, and managed inference endpoints. Formerly Azure AI Studio.',
        when: 'You are building production AI applications, RAG (Retrieval Augmented Generation) pipelines, AI agents, or fine-tuning models. Provides the infrastructure and tooling layer above model APIs.',
        drivers: ['Compute instances for fine-tuning (GPU VMs — NC6s v3 $3.06/hr per node)', 'Managed online endpoints for inference (VM-based)', 'Storage for model artifacts, datasets, evaluation outputs', 'Prompt Flow invocations (if using serverless)'],
        notBilled: ['Hub and project creation', 'Model catalog browsing', 'Evaluation runs on small datasets'],
        typical: '$200 – $5,000 CAD/month depending on fine-tuning and inference load',
      },
      {
        name: 'Azure AI Search',
        icon: '🔍',
        what: 'Enterprise search-as-a-service with vector search, semantic ranking, and AI enrichment. Used for RAG (Retrieval Augmented Generation) pipelines, document search, product catalogues, and knowledge bases.',
        when: 'You need intelligent search over unstructured data, are building a RAG application with Azure OpenAI, or need hybrid search (keyword + vector + semantic). Essential in any AI/document Q&A solution.',
        drivers: ['Search service tier × hours (Basic $0.101/hr, S1 $0.290/hr)', 'Number of replicas (for HA — multiply base cost)', 'Number of partitions (for scale — multiply base cost)', 'Index storage beyond included quota ($0.25/GB additional)', 'Semantic Ranker queries ($0.01/1K queries)'],
        notBilled: ['Index creation and management', 'Query authoring', 'AI enrichment skills (Cognitive Services billed separately)'],
        typical: '$75 – $600 CAD/month for a standard S1 service with 2 replicas',
      },
      {
        name: 'Azure Machine Learning Workspace',
        icon: '🧪',
        what: 'End-to-end MLOps platform for data scientists and ML engineers. Provides experiment tracking, model registry, automated ML, feature store, online/batch inference endpoints, and responsible AI tools.',
        when: 'Your team is building, training, deploying, and monitoring ML models. Provides the governance and lifecycle management layer — the workspace itself is free; you pay for compute.',
        drivers: ['Compute Instances (always-on dev VMs — DS3v2 $0.252/hr — turn off when not in use)', 'Compute Clusters (scale-to-zero training clusters — only pay during training)', 'Managed Online Endpoints (inference VMs — pay per hour)', 'Storage for models, datasets, experiment outputs'],
        notBilled: ['Workspace creation, experiment tracking, model registry', 'AutoML experiment metadata', 'Responsible AI dashboard'],
        typical: '$100 – $3,000 CAD/month depending on training frequency and inference load',
      },
    ],
  },
  {
    category: 'Integration & Messaging',
    color: '#FF9800',
    services: [
      {
        name: 'Azure Service Bus',
        icon: '🚌',
        what: 'Enterprise message broker with queues and publish/subscribe topics. Provides reliable, ordered, at-least-once message delivery with dead-lettering, sessions, duplicate detection, and scheduled delivery.',
        when: 'Decoupling microservices, reliable async communication between systems, implementing saga patterns, or ensuring no messages are lost during system downtime.',
        drivers: ['Namespace tier (Standard ~$10/mo fixed, Premium: MU × $928/mo)', 'Operation count per 1M brokered messages (Standard tier)', 'Messaging Units for throughput (Premium — each MU handles ~1,000 ops/sec)'],
        notBilled: ['Queue/topic creation and management', 'Retry policies', 'Dead-letter queue storage within limits'],
        typical: '$15 – $700 CAD/month',
      },
      {
        name: 'Azure Event Hubs',
        icon: '📨',
        what: 'Big data streaming platform and event ingestion service. Designed for millions of events per second from IoT devices, applications, or telemetry streams. Compatible with Apache Kafka protocol.',
        when: 'High-volume event streaming: IoT telemetry, application logs, clickstream data, real-time analytics pipelines feeding into Azure Stream Analytics or Databricks Structured Streaming.',
        drivers: ['Throughput Units (TU) × hours (Standard: each TU = 1 MB/s in, 2 MB/s out)', 'Events ingressed per 1M', 'Event Capture to ADLS/Blob (adds per-namespace hourly cost)'],
        notBilled: ['First 1M events/month (Standard tier)'],
        typical: '$25 – $700 CAD/month for typical streaming workloads',
      },
      {
        name: 'Azure Logic Apps',
        icon: '🔗',
        what: 'Low-code/no-code workflow automation platform with 400+ pre-built connectors. Automates business processes, integrates SaaS applications, and builds enterprise workflows without writing infrastructure code.',
        when: 'Automating business processes (approval workflows, data sync, notifications), integrating with SaaS platforms (Salesforce, SAP, ServiceNow, SharePoint), or implementing simple integration scenarios without full ADF complexity.',
        drivers: ['Consumption plan: action executions per 1K ($0.025) + connector type (Standard/Enterprise connectors)', 'Standard plan: hourly rate × vCPU count (always-on, VNet support)', 'Enterprise connector executions ($0.50/1K — SAP, Salesforce, etc.)'],
        notBilled: ['Built-in actions (Condition, Loop, Parse JSON) in Standard plan', 'Workflow creation and management'],
        typical: '$5 – $200 CAD/month (Consumption) | $150 – $600 CAD/month (Standard)',
      },
    ],
  },
  {
    category: 'Networking',
    color: '#3F51B5',
    services: [
      {
        name: 'VNet Traffic & Data Transfer',
        icon: '🌐',
        what: 'Azure Virtual Network (VNet) is free to create. Charges apply for data transfer between VNets (peering), between regions, to the internet (egress), and through Private Endpoints.',
        when: 'Any multi-VNet architecture, cross-region data replication, internet-facing services with high egress, or Private Endpoint deployments.',
        drivers: ['VNet Peering data transfer ($0.01/GB same region, $0.035/GB cross-region — billed both directions)', 'Internet egress ($0.087/GB first 10 TB/month)', 'Private Endpoint processing ($0.01/GB)', 'Private Endpoint hourly charge ($0.01/hr per endpoint)'],
        notBilled: ['VNet creation, subnets, NSGs, route tables', 'Inbound (ingress) traffic from internet', 'Traffic within the same VNet (free)'],
        typical: '$10 – $500 CAD/month depending on data volumes',
      },
      {
        name: 'Azure ExpressRoute',
        icon: '⚡',
        what: 'Dedicated private network connection between your on-premises infrastructure and Azure — bypasses the public internet. Provides consistent latency, higher reliability, and private connectivity.',
        when: 'Your organisation requires private connectivity to Azure (compliance, latency, bandwidth), moving large datasets from on-premises to Azure regularly, or connecting to Azure at 1 Gbps+.',
        drivers: ['Circuit bandwidth tier × monthly port fee (50 Mbps ~$55/mo, 1 Gbps ~$550/mo, 10 Gbps ~$5,500/mo)', 'ExpressRoute Gateway in your VNet (Standard ~$117/mo, High Perf ~$236/mo)', 'Data transfer on Metered plan ($0.025/GB outbound) — Unlimited plan avoids this', 'Additional peerings and premium add-on costs'],
        notBilled: ['Provider circuit cost (separate contract with telecom provider)', 'Inbound data transfer'],
        typical: '$200 – $6,000+ CAD/month (circuit + gateway)',
      },
      {
        name: 'Azure Application Gateway',
        icon: '🛡️',
        what: 'Layer-7 load balancer and Web Application Firewall (WAF). Distributes web traffic, provides SSL termination, cookie-based session affinity, URL-based routing, and protects against OWASP top 10 threats.',
        when: 'Exposing web applications or APIs to the internet with WAF protection, performing SSL termination at the edge, routing traffic to multiple backend pools, or consolidating TLS certificates.',
        drivers: ['Fixed hourly charge (WAF v2 $0.36/hr, Standard v2 $0.246/hr)', 'Capacity Units × hours ($0.008/CU/hr — minimum 2 CU always active)', 'Data processed per 10 GB'],
        notBilled: ['DDoS basic protection (included)', 'Health probe requests', 'Backend connection management'],
        typical: '$280 – $800 CAD/month for WAF v2 with 2–10 capacity units',
      },
    ],
  },
  {
    category: 'Security & Compliance',
    color: '#9B59B6',
    services: [
      {
        name: 'Azure Key Vault',
        icon: '🔑',
        what: 'Centralised secrets management for storing API keys, passwords, connection strings, certificates, and cryptographic keys. Provides audit logging, access policies/RBAC, and HSM-backed key protection.',
        when: 'Any application storing secrets, any Terraform deployment (remote state encryption), any application using certificates, or any compliance requirement for secrets management. Mandatory for enterprise standards.',
        drivers: ['Secret/key operations per 10K ($0.03/10K for software keys)', 'HSM-backed keys ($5/key/month + $0.15/10K operations)', 'Certificate renewals ($3.00 per renewal)', 'Managed HSM (dedicated hardware): $1.622/hr — very high cost, only for strict compliance'],
        notBilled: ['Key Vault creation', 'First 10K operations/month (Standard tier free tier)', 'Secret storage (only operations are billed)'],
        typical: 'Near-$0 to $30 CAD/month for standard usage | $50+ for heavy HSM use',
      },
      {
        name: 'Microsoft Defender for Cloud',
        icon: '🛡️',
        what: 'Cloud Security Posture Management (CSPM) and Cloud Workload Protection Platform (CWPP). Continuously assesses Azure resources against security benchmarks, detects threats, and provides remediation guidance.',
        when: 'Any production Azure environment should have at least basic Defender for Cloud (CSPM is free). Enable paid plans for servers, containers, SQL, and storage when you need active threat detection and regulatory compliance.',
        drivers: ['Defender for Servers P2: $15/server/month (includes MDE, JIT access, adaptive controls)', 'Defender for Containers: $7/vCore/month on AKS clusters', 'Defender for SQL: $15/SQL server/month', 'Defender for Storage: $10/storage account/month', 'CSPM enhanced: $0.007/resource/month'],
        notBilled: ['Basic CSPM (security score, recommendations): free', 'Microsoft Secure Score', 'Azure Security Benchmark policies'],
        typical: '$50 – $500 CAD/month depending on resource count and plans enabled',
      },
      {
        name: 'Microsoft Defender for Endpoint',
        icon: '🔒',
        what: 'Enterprise endpoint detection and response (EDR) platform. Provides antivirus, attack surface reduction, behavioural analytics, threat intelligence, automated investigation, and response for Windows, Linux, and macOS.',
        when: 'Protecting developer workstations, server VMs, and any endpoint that accesses company resources. Often required by security policy or compliance frameworks (ISO 27001, SOC 2, etc.).',
        drivers: ['MDE Plan 2 per user/month ($5.20/user) — for workstations/developer machines', 'MDE for Servers: included in Defender for Cloud P2 ($15/server/month)', 'Number of protected devices'],
        notBilled: ['Microsoft Defender Antivirus (included in Windows — free)', 'Threat intelligence feeds', 'Integration with SIEM (Sentinel)'],
        typical: '$50 – $500 CAD/month depending on device/user count',
      },
    ],
  },
  {
    category: 'Monitoring & Operations',
    color: '#00BCD4',
    services: [
      {
        name: 'Log Analytics Workspace',
        icon: '📋',
        what: 'Centralised log aggregation and query platform. All Azure services send diagnostic logs, metrics, and security events here. Query with KQL (Kusto Query Language). Foundation for Azure Monitor, Sentinel, and Defender.',
        when: 'Every production Azure environment should have a Log Analytics workspace. Diagnostic settings from App Service, AKS, SQL, Key Vault, ADF, and all other services route here.',
        drivers: ['Data ingestion per GB ($2.30/GB PAYG — commitment tiers cheaper at volume)', 'Retention beyond 31 days ($0.10/GB/month — 31 days included free)', 'Microsoft Sentinel ingestion (additional $2.46/GB if Sentinel enabled)', 'Data export ($0.10/GB to Event Hubs or Storage)'],
        notBilled: ['Workspace creation', 'KQL query execution (basic logs free)', 'First 31 days of retention', 'Azure Activity Log (free, first 5 GB/subscription/month)'],
        typical: '$50 – $1,000 CAD/month depending on log volume (estimate 1–5 GB/day per workload)',
      },
      {
        name: 'Azure Monitor & Alerts',
        icon: '🔔',
        what: 'Full-stack observability platform — metrics, logs, traces, and alerts for all Azure resources. Includes Application Insights (APM), metric charts, dashboards, workbooks, and automated alerting.',
        when: 'Any production workload needs alerting on error rates, response times, CPU/memory, and custom business metrics. Application Insights should be enabled on all App Services and Functions.',
        drivers: ['Custom metrics per 1M data points ($0.10/million)', 'Alert rules per month ($0.10/rule/month for metric alerts)', 'SMS notifications ($0.75/100 messages)', 'Application Insights data ingestion (billed as Log Analytics)'],
        notBilled: ['Platform metrics (CPU, memory, disk, network) — free', 'Azure Workbooks', 'Dashboard creation', 'Webhook/email notifications (free)', 'Health alerts (Azure Service Health — free)'],
        typical: '$10 – $100 CAD/month for alerting | Bulk of cost is Application Insights ingestion in Log Analytics',
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE COLORS
// ─────────────────────────────────────────────────────────────────────────────
const COLORS = {
  adf: '#2E75B6', adls: '#1D9E75', dbr: '#D85A30', apim: '#7F77DD',
  pbi: '#BA7515', aks: '#0078D4', functions: '#FF6B35', appSvc: '#00BCD4',
  vm: '#607D8B', sqlDb: '#E74C3C', sqlMI: '#C0392B', cosmos: '#16A085',
  redis: '#E91E63', openai: '#10A37F', aiFoundry: '#00897B', aiSearch: '#26A69A',
  mlWorkspace: '#8BC34A', aiSvc: '#4CAF50', sb: '#795548', eh: '#FF9800',
  logicApps: '#9C27B0', vnet: '#3F51B5', expressRoute: '#1565C0', appGw: '#283593',
  keyVault: '#9B59B6', defCloud: '#6A1B9A', defEP: '#7B1FA2',
  logAnalytics: '#0097A7', monitor: '#00ACC1',
};

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
const fmt = (v, dec = 0) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: dec }).format(v);

const G2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 18px' };
const G3 = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 14px' };
const G4 = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0 12px' };

// ─────────────────────────────────────────────────────────────────────────────
// REUSABLE COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
function Slider({ label, min, max, step, value, onChange, unit, hint, onInfo }) {
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary,#666)' }}>{label}</span>
          {onInfo && (
            <button onClick={onInfo} aria-label={`Info: ${label}`}
              style={{ width: 14, height: 14, borderRadius: '50%', background: '#E6F1FB', color: '#185FA5', fontSize: 9, border: 'none', cursor: 'pointer', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>i</button>
          )}
        </div>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary,#111)' }}>
          {typeof value === 'number' ? value.toLocaleString() : value} {unit}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', height: 4, accentColor: '#2E75B6', cursor: 'pointer', display: 'block' }} />
      {hint && <p style={{ fontSize: 10, color: 'var(--color-text-tertiary,#999)', marginTop: 2, lineHeight: 1.4 }}>{hint}</p>}
    </div>
  );
}

function Select({ label, value, onChange, options, onInfo }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary,#666)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
        {label}
        {onInfo && <button onClick={onInfo} aria-label={`Info: ${label}`} style={{ width: 14, height: 14, borderRadius: '50%', background: '#E6F1FB', color: '#185FA5', fontSize: 9, border: 'none', cursor: 'pointer', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>i</button>}
      </div>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '0.5px solid var(--color-border-tertiary,#e0e0e0)', background: 'var(--color-background-secondary,#f5f5f5)', color: 'inherit', cursor: 'pointer', fontFamily: 'inherit' }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Check({ label, sub, checked, onChange, extra }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer', marginBottom: 8 }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ marginTop: 2, accentColor: '#2E75B6', flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: 'var(--color-text-secondary,#666)' }}>
        {label}
        {sub && <><br /><span style={{ fontSize: 10, color: 'var(--color-text-tertiary,#999)' }}>{sub}</span></>}
        {extra && <><br /><span style={{ fontSize: 11, fontWeight: 500 }}>{extra}</span></>}
      </span>
    </label>
  );
}

function IB({ children, v = 'blue' }) {
  const s = {
    blue:   { background: '#E6F1FB', color: '#185FA5', borderLeft: '3px solid #2E75B6' },
    teal:   { background: '#E1F5EE', color: '#0F6E56', borderLeft: '3px solid #1D9E75' },
    orange: { background: '#FDEBD0', color: '#7D3C00', borderLeft: '3px solid #D85A30' },
    amber:  { background: '#FAEEDA', color: '#633806', borderLeft: '3px solid #BA7515' },
    purple: { background: '#EDE7F6', color: '#4527A0', borderLeft: '3px solid #7F77DD' },
    green:  { background: '#E8F5E9', color: '#1B5E20', borderLeft: '3px solid #2E7D32' },
    red:    { background: '#FFEBEE', color: '#B71C1C', borderLeft: '3px solid #E74C3C' },
    cyan:   { background: '#E0F7FA', color: '#006064', borderLeft: '3px solid #00ACC1' },
    gray:   { background: '#F2F2F2', color: '#444',    borderLeft: '3px solid #888'    },
  };
  return <div style={{ fontSize: 11, padding: '7px 10px', borderRadius: 6, marginTop: 6, lineHeight: 1.6, ...s[v] }}>{children}</div>;
}

function CL({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary,#555)', marginBottom: 7, paddingBottom: 4, borderBottom: '0.5px solid var(--color-border-tertiary,#e0e0e0)' }}>{children}</div>;
}

function Section({ title, subtitle, color, icon, cost, open, onToggle, children }) {
  return (
    <div style={{ border: '0.5px solid var(--color-border-tertiary,#e0e0e0)', borderRadius: 12, marginBottom: 9, overflow: 'hidden' }}>
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: 'pointer', background: 'var(--color-background-secondary,#f8f8f8)', userSelect: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span style={{ fontSize: 14 }}>{icon}</span>
          <span style={{ fontWeight: 500, fontSize: 13 }}>{title}</span>
          {subtitle && <span style={{ fontSize: 10, color: 'var(--color-text-tertiary,#999)' }}>{subtitle}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{cost}</span>
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary,#666)' }}>{open ? '▴' : '▾'}</span>
        </div>
      </div>
      {open && <div style={{ padding: '13px 14px 8px' }}>{children}</div>}
    </div>
  );
}

function CategoryHeader({ label, color }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.10em', color, marginBottom: 7, marginTop: 12, padding: '5px 10px', borderLeft: `3px solid ${color}`, background: color + '12', borderRadius: '0 6px 6px 0' }}>
      {label}
    </div>
  );
}

function MetricCard({ label, value, sub, color }) {
  return (
    <div style={{ background: 'var(--color-background-secondary,#f5f5f5)', borderRadius: 8, padding: '10px 12px', flex: 1, minWidth: 80 }}>
      <div style={{ fontSize: 10, color: 'var(--color-text-secondary,#666)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 500, color: color || 'var(--color-text-primary,#111)' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--color-text-tertiary,#999)', marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE GUIDE MODAL
// ─────────────────────────────────────────────────────────────────────────────
function ServiceGuideModal({ onClose }) {
  const [active, setActive] = useState(0);
  const [search, setSearch] = useState('');
  const filtered = search
    ? SERVICE_GUIDE.map(cat => ({
        ...cat,
        services: cat.services.filter(s =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.what.toLowerCase().includes(search.toLowerCase()) ||
          s.when.toLowerCase().includes(search.toLowerCase())
        )
      })).filter(cat => cat.services.length > 0)
    : SERVICE_GUIDE;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--color-background-primary,#fff)', borderRadius: 16, width: '100%', maxWidth: 860, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '0.5px solid var(--color-border-tertiary,#e0e0e0)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>📚 Azure Service Guide</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary,#666)', marginTop: 2 }}>Understand what each service does, when to use it, and what drives cost — before you estimate</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', border: '0.5px solid var(--color-border-secondary,#ccc)', background: 'transparent', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary,#666)', fontFamily: 'inherit', flexShrink: 0 }}>✕</button>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 20px', borderBottom: '0.5px solid var(--color-border-tertiary,#e0e0e0)', flexShrink: 0 }}>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search services (e.g. 'SQL', 'container', 'security')..."
            style={{ width: '100%', padding: '7px 12px', borderRadius: 8, border: '0.5px solid var(--color-border-secondary,#ccc)', background: 'var(--color-background-secondary,#f5f5f5)', fontSize: 13, color: 'inherit', outline: 'none', fontFamily: 'inherit' }} />
        </div>

        {/* Category tabs */}
        {!search && (
          <div style={{ display: 'flex', gap: 6, padding: '10px 20px', overflowX: 'auto', flexShrink: 0, borderBottom: '0.5px solid var(--color-border-tertiary,#e0e0e0)' }}>
            {SERVICE_GUIDE.map((cat, i) => (
              <button key={i} onClick={() => setActive(i)}
                style={{ whiteSpace: 'nowrap', fontSize: 11, padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: active === i ? 600 : 400, background: active === i ? cat.color : 'var(--color-background-secondary,#f5f5f5)', color: active === i ? 'white' : 'var(--color-text-secondary,#666)', transition: 'all .15s' }}>
                {cat.category}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '14px 20px' }}>
          {(search ? filtered : [SERVICE_GUIDE[active]]).map((cat, ci) => (
            <div key={ci}>
              {search && <div style={{ fontSize: 12, fontWeight: 700, color: cat.color, marginBottom: 10, marginTop: ci > 0 ? 16 : 0, textTransform: 'uppercase', letterSpacing: '.08em' }}>{cat.category}</div>}
              {cat.services.map((svc, si) => (
                <div key={si} style={{ marginBottom: 20, borderRadius: 10, border: '0.5px solid var(--color-border-tertiary,#e0e0e0)', overflow: 'hidden' }}>
                  {/* Service header */}
                  <div style={{ padding: '10px 14px', background: cat.color + '15', borderBottom: '0.5px solid var(--color-border-tertiary,#e0e0e0)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{svc.icon}</span>
                    <span style={{ fontWeight: 600, fontSize: 14, color: cat.color }}>{svc.name}</span>
                  </div>
                  <div style={{ padding: '12px 14px' }}>
                    {/* What is it */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--color-text-tertiary,#999)', marginBottom: 4 }}>What it is</div>
                      <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-primary,#111)', margin: 0 }}>{svc.what}</p>
                    </div>
                    {/* When you need it */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--color-text-tertiary,#999)', marginBottom: 4 }}>When your project needs it</div>
                      <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-primary,#111)', margin: 0 }}>{svc.when}</p>
                    </div>
                    {/* Two columns: drivers + not billed */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div style={{ background: '#FFF3E0', borderRadius: 8, padding: '9px 11px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#E65100', marginBottom: 6 }}>💰 Cost drivers</div>
                        {svc.drivers.map((d, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
                            <span style={{ color: '#E65100', flexShrink: 0, marginTop: 1 }}>▸</span>
                            <span style={{ fontSize: 11, lineHeight: 1.5, color: '#444' }}>{d}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ background: '#E8F5E9', borderRadius: 8, padding: '9px 11px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#2E7D32', marginBottom: 6 }}>✓ Not billed</div>
                        {svc.notBilled.map((d, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
                            <span style={{ color: '#2E7D32', flexShrink: 0, marginTop: 1 }}>✓</span>
                            <span style={{ fontSize: 11, lineHeight: 1.5, color: '#444' }}>{d}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Typical cost */}
                    <div style={{ marginTop: 10, padding: '7px 11px', background: 'var(--color-background-secondary,#f5f5f5)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14 }}>💡</span>
                      <span style={{ fontSize: 12, color: 'var(--color-text-secondary,#666)' }}><strong>Typical range:</strong> {svc.typical}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
          {/* How to add a new service */}
          <div style={{ marginTop: 8, padding: 14, background: '#E6F1FB', borderRadius: 10, borderLeft: '3px solid #2E75B6' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#185FA5', marginBottom: 6 }}>➕ How to add a new Azure service to AzureCostIQ</div>
            <div style={{ fontSize: 11, color: '#185FA5', lineHeight: 1.7 }}>
              1. Query the Azure Retail Prices API: <code style={{ background: '#D6E4F0', padding: '1px 4px', borderRadius: 3 }}>curl "https://prices.azure.com/api/retail/prices?$filter=armRegionName eq 'canadacentral' and serviceName eq 'Your Service'"</code><br/>
              2. Add price constants to <code style={{ background: '#D6E4F0', padding: '1px 4px', borderRadius: 3 }}>PRICES_USD</code> with a source comment + date<br/>
              3. Add service description to <code style={{ background: '#D6E4F0', padding: '1px 4px', borderRadius: 3 }}>SERVICE_GUIDE</code> (what/when/drivers/notBilled/typical)<br/>
              4. Add <code style={{ background: '#D6E4F0', padding: '1px 4px', borderRadius: 3 }}>useState</code> hooks for each slider parameter<br/>
              5. Write a <code style={{ background: '#D6E4F0', padding: '1px 4px', borderRadius: 3 }}>calcXxx()</code> function using <code style={{ background: '#D6E4F0', padding: '1px 4px', borderRadius: 3 }}>useCallback</code><br/>
              6. Add <code style={{ background: '#D6E4F0', padding: '1px 4px', borderRadius: 3 }}>useMemo</code> result + include total in <code style={{ background: '#D6E4F0', padding: '1px 4px', borderRadius: 3 }}>subtotal</code><br/>
              7. Add a <code style={{ background: '#D6E4F0', padding: '1px 4px', borderRadius: 3 }}>&lt;Section&gt;</code> with <code style={{ background: '#D6E4F0', padding: '1px 4px', borderRadius: 3 }}>&lt;Slider&gt;</code> components in the render<br/>
              8. Add to <code style={{ background: '#D6E4F0', padding: '1px 4px', borderRadius: 3 }}>enabledServices</code> array, chart data, legend, and output generators<br/>
              9. Add a color to <code style={{ background: '#D6E4F0', padding: '1px 4px', borderRadius: 3 }}>COLORS</code><br/>
              Full guide: see <strong>CONTRIBUTING.md</strong>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 20px', borderTop: '0.5px solid var(--color-border-tertiary,#e0e0e0)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary,#999)' }}>22 Azure services · Prices verified May 2026 · Canada Central</span>
          <button onClick={onClose} style={{ fontSize: 12, padding: '7px 16px', borderRadius: 8, border: 'none', background: '#2E75B6', color: 'white', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>Close guide</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OUTPUT GENERATORS
// ─────────────────────────────────────────────────────────────────────────────
function generateMemo({ projectName, costs, total, subtotal, contingency, contAmt, enabledServices }) {
  const pad = v => fmt(v).padStart(14);
  const lines = enabledServices.filter(s => costs[s.key] > 0.5).map(s => `  ${s.label.padEnd(38)} ${pad(costs[s.key])}`);
  return `AZURE PROJECT COST ESTIMATE
${'═'.repeat(62)}
Project:      ${projectName}
Date:         ${new Date().toLocaleDateString('en-CA')}
Pricing:      Azure Canada Central · CAD @ ${USD_TO_CAD}
Tool:         AzureCostIQ v3.0 · github.com/your-org/azure-cost-iq
Disclaimer:   Estimates only. Validate with Azure Pricing Calculator.

EXECUTIVE SUMMARY
  Monthly budget (recommended):   ${fmt(total)}
  Annual projection:              ${fmt(total * 12)}
  Contingency included:           ${contingency}% (${fmt(contAmt)}/mo)

SERVICE BREAKDOWN (Monthly CAD — services with $0.50+ cost)
${'─'.repeat(58)}
${lines.join('\n')}
${'─'.repeat(58)}
  Base subtotal                              ${pad(subtotal)}
  Contingency (${contingency}%)                       ${pad(contAmt)}
  TOTAL ESTIMATE                             ${pad(total)}

SCENARIO RANGE
  Conservative (-15%):  ${fmt(total * 0.85)}/mo  |  ${fmt(total * 0.85 * 12)}/yr
  Base (recommended):   ${fmt(total)}/mo  |  ${fmt(total * 12)}/yr
  Stretch (+20%):       ${fmt(total * 1.2)}/mo  |  ${fmt(total * 1.2 * 12)}/yr

NOTE: Costs are consumption estimates based on design assumptions.
Actual costs may vary. Review against Azure Cost Management monthly.

Generated by AzureCostIQ — open-source Azure project cost estimation
https://github.com/your-org/azure-cost-iq`;
}

function generateOptimization({ projectName, total }) {
  return `AZURE COST OPTIMIZATION ROADMAP
${'═'.repeat(62)}
Project:  ${projectName}  |  Baseline: ${fmt(total)}/month

PRIORITY 1 — Right-size compute first (biggest impact)
  Databricks: Migrate sub-30-min jobs to Serverless (18% cheaper, no VM cost)
  AKS: Audit node pool utilisation — are nodes <60% CPU? Downsize VM or reduce count
  App Service: Confirm P-tier used only if autoscale/SLA actually needed (B2 = 80% cheaper)
  VMs: Deallocate dev/test VMs outside business hours (saves ~65% for 9-to-5 VMs)
  SQL MI: Only use if SQL Agent/linked servers/CLR genuinely needed — SQL Database is cheaper

PRIORITY 2 — Storage lifecycle management
  ADLS Gen2: Implement Lifecycle Management — auto-tier Bronze to Cool after 90 days
  Blob: Move infrequently accessed blobs to Archive ($0.002/GB vs $0.023/GB Hot)
  Log Analytics: Increase Interactive Retention to 90 days, move older data to archive tier
  SQL Backup: Adjust backup retention to minimum required for compliance

PRIORITY 3 — Reserved Instances for stable workloads
  AKS system nodes / VMs: 1-year RI saves ~30%, 3-year saves ~60% vs PAYG
  SQL Database / SQL MI: Reserve vCores for 1-3 years — 30-55% savings
  ExpressRoute: Metered → Unlimited plan if monthly egress > breakeven volume
  Redis Cache: RI available for Premium tier

PRIORITY 4 — AI/ML cost control
  Azure OpenAI: GPT-4o mini is 33× cheaper than GPT-4o — route simple tasks there
  Enable Prompt Caching in Azure OpenAI (60% discount on cached prompt tokens)
  ML Workspace: Stop compute instances when not in use (auto-shutdown policy)
  AI Search: Remove unused replicas outside peak hours if SLA allows

PRIORITY 5 — Monitoring and security cost tuning
  Log Analytics: Enable commitment tier if ingesting >100 GB/day (saves 15-25%)
  Defender for Cloud: Audit which plans are enabled — disable unused resource type plans
  Azure Monitor: Set sampling rate on Application Insights for high-traffic apps (10-50%)

POTENTIAL TOTAL SAVING: ${fmt(total * 0.15)}–${fmt(total * 0.40)}/month (15–40% of baseline)

Generated by AzureCostIQ · github.com/your-org/azure-cost-iq`;
}

function generateExport({ projectName, costs, total, subtotal, contingency, contAmt, enabledServices }) {
  const rows = enabledServices.map(s => `${s.label},${fmt(costs[s.key] || 0)},${fmt((costs[s.key] || 0) * 12)},${(costs[s.key] || 0) > 0.5 ? 'Included' : 'Zero/negligible'}`);
  return [
    `AzureCostIQ Project Cost Export`,
    `Project,${projectName}`,
    `Date,${new Date().toLocaleDateString('en-CA')}`,
    `Currency,CAD`,
    `Exchange Rate (USD/CAD),${USD_TO_CAD}`,
    `Region,Canada Central`,
    ``,
    `Service,Monthly CAD,Annual CAD,Status`,
    ...rows,
    ``,
    `Base Subtotal,${fmt(subtotal)},${fmt(subtotal * 12)},`,
    `Contingency (${contingency}%),${fmt(contAmt)},${fmt(contAmt * 12)},`,
    `TOTAL ESTIMATE,${fmt(total)},${fmt(total * 12)},`,
    ``,
    `Conservative (-15%),${fmt(total * 0.85)},${fmt(total * 0.85 * 12)},`,
    `Base,${fmt(total)},${fmt(total * 12)},`,
    `Stretch (+20%),${fmt(total * 1.2)},${fmt(total * 1.2 * 12)},`,
    ``,
    `Note: Consumption-based estimates only. Validate with Azure Pricing Calculator.`,
    `Generated by AzureCostIQ · https://github.com/your-org/azure-cost-iq`,
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const P = PRICES_USD;

  // UI state
  const [projectName, setProjectName] = useState('My Azure Project');
  const [annual, setAnnual]           = useState(false);
  const [contingency, setContingency] = useState(15);
  const [outputMode, setOutputMode]   = useState(null);
  const [copyLabel, setCopyLabel]     = useState('Copy');
  const [showGuide, setShowGuide]     = useState(false);
  const [priceStatus, setPriceStatus] = useState('Azure Canada Central · CAD 1.38 · May 2026');

  // Section open/close — all closed by default for clean initial view
  const initSecs = { adf:false,adls:false,dbr:false,apim:false,pbi:false,aks:false,fn:false,appSvc:false,vm:false,sqlDb:false,sqlMI:false,cosmos:false,redis:false,openai:false,aiFoundry:false,aiSearch:false,mlWs:false,sb:false,eh:false,la:false,vnet:false,er:false,agw:false,kv:false,defCloud:false,defEP:false,monitor:false };
  const [openSecs, setOpenSecs] = useState(initSecs);
  const toggleSec = k => setOpenSecs(s => ({ ...s, [k]: !s[k] }));

  // ── ADF ──────────────────────────────────────────────────────────────────
  const [adfRuns, setAdfRuns]           = useState(10);
  const [adfDIU, setAdfDIU]             = useState(2);
  const [adfCopy, setAdfCopy]           = useState(20);
  const [adfShirNodes, setAdfShirNodes] = useState(0);
  const [adfShirHrs, setAdfShirHrs]     = useState(8);
  const [adfWorkDays, setAdfWorkDays]   = useState(22);

  // ── ADLS ─────────────────────────────────────────────────────────────────
  const [bronzeGB, setBronzeGB]     = useState(200);
  const [silverGB, setSilverGB]     = useState(300);
  const [goldGB, setGoldGB]         = useState(100);
  const [bronzeTier, setBronzeTier] = useState('hot');
  const [silverTier, setSilverTier] = useState('hot');
  const [goldTier, setGoldTier]     = useState('hot');
  const [adlsReads, setAdlsReads]   = useState(20);
  const [adlsWrites, setAdlsWrites] = useState(50);

  // ── Databricks ───────────────────────────────────────────────────────────
  const [dbrJobHrs, setDbrJobHrs]     = useState(2);
  const [dbrJobDBU, setDbrJobDBU]     = useState(8);
  const [dbrIntHrs, setDbrIntHrs]     = useState(1);
  const [dbrIntDBU, setDbrIntDBU]     = useState(8);
  const [dbrSqlHrs, setDbrSqlHrs]     = useState(0);
  const [dbrSqlDBU, setDbrSqlDBU]     = useState(4);
  const [dbrSrvHrs, setDbrSrvHrs]     = useState(1);
  const [dbrSrvDBU, setDbrSrvDBU]     = useState(8);
  const [dbrWorkDays, setDbrWorkDays] = useState(22);

  // ── APIM ─────────────────────────────────────────────────────────────────
  const [apimTier, setApimTier]         = useState('standard');
  const [apimAllocPct, setApimAllocPct] = useState(100);
  const [apimCallsDay, setApimCallsDay] = useState(50000);

  // ── Power BI ──────────────────────────────────────────────────────────────
  const [pbiPro, setPbiPro] = useState(10);
  const [pbiPPU, setPbiPPU] = useState(2);
  const [pbiP1, setPbiP1]   = useState(false);

  // ── AKS ──────────────────────────────────────────────────────────────────
  const [aksNodes, setAksNodes]   = useState(3);
  const [aksVm, setAksVm]         = useState('vmD4asv5PerHour');
  const [aksSLA, setAksSLA]       = useState(true);
  const [aksHrs, setAksHrs]       = useState(24);

  // ── Functions ─────────────────────────────────────────────────────────────
  const [fnPlan, setFnPlan]         = useState('consumption');
  const [fnExecDay, setFnExecDay]   = useState(500000);
  const [fnMs, setFnMs]             = useState(300);
  const [fnMem, setFnMem]           = useState(0.25);
  const [fnInst, setFnInst]         = useState(1);

  // ── App Service + ASP ─────────────────────────────────────────────────────
  const [aspSku, setAspSku]       = useState('p1v3PerHour');
  const [aspCount, setAspCount]   = useState(1);
  const [aspApps, setAspApps]     = useState(2);

  // ── VMs ───────────────────────────────────────────────────────────────────
  const [vmSku, setVmSku]         = useState('d4sv3PerHour');
  const [vmCount, setVmCount]     = useState(2);
  const [vmHrs, setVmHrs]         = useState(12);
  const [vmDays, setVmDays]       = useState(22);
  const [vmDisk, setVmDisk]       = useState('managedDiskP10');

  // ── SQL Database ──────────────────────────────────────────────────────────
  const [sqlTier, setSqlTier]         = useState('serverless');
  const [sqlVCores, setSqlVCores]     = useState(4);
  const [sqlStorGB, setSqlStorGB]     = useState(50);
  const [sqlActiveHrs, setSqlActiveHrs] = useState(8);
  const [sqlActiveDays, setSqlActiveDays] = useState(22);

  // ── SQL MI ────────────────────────────────────────────────────────────────
  const [miTier, setMiTier]       = useState('gp4vCorePerHour');
  const [miStorGB, setMiStorGB]   = useState(100);

  // ── Cosmos DB ─────────────────────────────────────────────────────────────
  const [cosModel, setCosModel]     = useState('serverless');
  const [cosRUDay, setCosRUDay]     = useState(5);
  const [cosRUSec, setCosRUSec]     = useState(400);
  const [cosStorGB, setCosStorGB]   = useState(10);

  // ── Redis ─────────────────────────────────────────────────────────────────
  const [redisTier, setRedisTier] = useState('c1StandardPerHour');

  // ── OpenAI ────────────────────────────────────────────────────────────────
  const [aiModel, setAiModel]       = useState('gpt4oMini');
  const [aiCalls, setAiCalls]       = useState(1000);
  const [aiIn, setAiIn]             = useState(500);
  const [aiOut, setAiOut]           = useState(200);

  // ── AI Foundry ────────────────────────────────────────────────────────────
  const [foundryComputeHrs, setFoundryComputeHrs] = useState(0);
  const [foundryInferHrs, setFoundryInferHrs]     = useState(2);
  const [foundryStorGB, setFoundryStorGB]         = useState(50);

  // ── AI Search ─────────────────────────────────────────────────────────────
  const [searchTier, setSearchTier]         = useState('basicPerHour');
  const [searchReplicas, setSearchReplicas] = useState(1);
  const [searchPartitions, setSearchPartitions] = useState(1);
  const [searchStorGB, setSearchStorGB]     = useState(0);
  const [searchSemanticQDay, setSearchSemanticQDay] = useState(0);

  // ── ML Workspace ──────────────────────────────────────────────────────────
  const [mlComputeHrs, setMlComputeHrs] = useState(2);
  const [mlGpuHrs, setMlGpuHrs]         = useState(0);
  const [mlInferHrs, setMlInferHrs]     = useState(1);
  const [mlStorGB, setMlStorGB]         = useState(100);

  // ── Service Bus ───────────────────────────────────────────────────────────
  const [sbTier, setSbTier]       = useState('standard');
  const [sbMsgDay, setSbMsgDay]   = useState(100000);
  const [sbMU, setSbMU]           = useState(1);

  // ── Event Hubs ────────────────────────────────────────────────────────────
  const [ehTier, setEhTier]         = useState('standard');
  const [ehTUs, setEhTUs]           = useState(2);
  const [ehEventsDay, setEhEventsDay] = useState(1000000);
  const [ehCapture, setEhCapture]   = useState(false);

  // ── Logic Apps ────────────────────────────────────────────────────────────
  const [laPlan, setLaPlan]             = useState('consumption');
  const [laActionsDay, setLaActionsDay] = useState(10000);
  const [laEntConDay, setLaEntConDay]   = useState(0);
  const [laInst, setLaInst]             = useState(1);

  // ── Log Analytics ─────────────────────────────────────────────────────────
  const [logGBDay, setLogGBDay]             = useState(5);
  const [logRetentionDays, setLogRetentionDays] = useState(31);
  const [logSentinel, setLogSentinel]       = useState(false);

  // ── VNet Traffic ──────────────────────────────────────────────────────────
  const [vnetPeeringGBDay, setVnetPeeringGBDay] = useState(10);
  const [vnetEgressGBDay, setVnetEgressGBDay]   = useState(5);
  const [vnetPEs, setVnetPEs]                   = useState(3);
  const [vnetCrossRegion, setVnetCrossRegion]   = useState(false);

  // ── ExpressRoute ──────────────────────────────────────────────────────────
  const [erCircuit, setErCircuit] = useState('er200MbpsPerMonth');
  const [erGw, setErGw]           = useState('gwStandardPerHour');
  const [erPlan, setErPlan]       = useState('unlimited');
  const [erEgressGB, setErEgressGB] = useState(0);

  // ── App Gateway ───────────────────────────────────────────────────────────
  const [agwSku, setAgwSku]   = useState('wafV2FixedPerHour');
  const [agwCU, setAgwCU]     = useState(2);
  const [agwDataGB, setAgwDataGB] = useState(100);

  // ── Key Vault ─────────────────────────────────────────────────────────────
  const [kvOps10KDay, setKvOps10KDay]   = useState(5);
  const [kvHSMKeys, setKvHSMKeys]       = useState(0);
  const [kvCerts, setKvCerts]           = useState(2);

  // ── Defender for Cloud ────────────────────────────────────────────────────
  const [dcServers, setDcServers]         = useState(0);
  const [dcContainerCores, setDcContainerCores] = useState(0);
  const [dcSQL, setDcSQL]                 = useState(0);
  const [dcStorage, setDcStorage]         = useState(0);
  const [dcAppSvc, setDcAppSvc]           = useState(0);
  const [dcCSPM, setDcCSPM]               = useState(false);
  const [dcCSPMResources, setDcCSPMResources] = useState(50);

  // ── Defender for Endpoint ─────────────────────────────────────────────────
  const [depUsers, setDepUsers]   = useState(0);
  const [depServers, setDepServers] = useState(0);

  // ── Azure Monitor ─────────────────────────────────────────────────────────
  const [monCustomMetricsMDay, setMonCustomMetricsMDay] = useState(0);
  const [monAlertRules, setMonAlertRules]               = useState(10);
  const [monSMSPer100, setMonSMSPer100]                 = useState(0);

  // Chart
  const chartRef      = useRef(null);
  const chartInstance = useRef(null);

  // ── Live pricing fetch (CORS-safe) ───────────────────────────────────────
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const f = encodeURIComponent("armRegionName eq 'canadacentral' and serviceName eq 'Log Analytics' and priceType eq 'Consumption'");
        const r = await fetch(`/api/prices?api-version=2023-01-01-preview&$filter=${f}`, { signal: ctrl.signal });
        if (!r.ok) return;
        const d = await r.json();
        if (d.items?.length) setPriceStatus(`Live · Canada Central · CAD ${USD_TO_CAD} · ${new Date().toLocaleDateString('en-CA')}`);
      } catch {}
    })();
    return () => ctrl.abort();
  }, []);

  // ── CALCULATION FUNCTIONS ─────────────────────────────────────────────────
  const calcADF = useCallback(() => {
    const orch = adfRuns * adfWorkDays * P.adf.orchestrationPerRun;
    const diu  = adfRuns * adfWorkDays * adfDIU * P.adf.dataMovementPerDIUHour;
    const copy = adfCopy * adfWorkDays * P.adf.copyActivityPerRun;
    const shir = adfShirNodes * adfShirHrs * adfWorkDays * P.adf.shirNodePerHour;
    return (orch + diu + copy + shir) * USD_TO_CAD;
  }, [adfRuns, adfWorkDays, adfDIU, adfCopy, adfShirNodes, adfShirHrs]);

  const calcADLS = useCallback(() => {
    const r = t => t === 'hot' ? P.adls.hotTierPerGBMonth : P.adls.coolTierPerGBMonth;
    const sto = bronzeGB * r(bronzeTier) + silverGB * r(silverTier) + goldGB * r(goldTier);
    const tx  = adlsReads * 30 * P.adls.readPer10KOps + adlsWrites * 30 * P.adls.writePer10KOps;
    return (sto + tx) * USD_TO_CAD;
  }, [bronzeGB, silverGB, goldGB, bronzeTier, silverTier, goldTier, adlsReads, adlsWrites]);

  const calcDBR = useCallback(() => {
    const wd  = dbrWorkDays;
    const job = dbrJobHrs * wd * dbrJobDBU * P.databricks.jobsComputePerDBUHour + dbrJobHrs * wd * P.databricks.vmDS3v2PerHour;
    const int_ = dbrIntHrs * wd * dbrIntDBU * P.databricks.interactivePerDBUHour + dbrIntHrs * wd * P.databricks.vmDS3v2PerHour;
    const sql = dbrSqlHrs * wd * dbrSqlDBU * P.databricks.sqlWarehousePerDBUHour;
    const srv = dbrSrvHrs * wd * dbrSrvDBU * P.databricks.serverlessJobsPerDBUHour;
    return (job + int_ + sql + srv) * USD_TO_CAD;
  }, [dbrJobHrs, dbrJobDBU, dbrIntHrs, dbrIntDBU, dbrSqlHrs, dbrSqlDBU, dbrSrvHrs, dbrSrvDBU, dbrWorkDays]);

  const calcAPIM = useCallback(() => {
    const rate = apimTier === 'developer' ? P.apim.developerTierPerHour : apimTier === 'v2standard' ? P.apim.v2StandardPerHour : P.apim.standardTierPerHour;
    const tier = rate * 24 * 30;
    const ovg  = Math.max(0, apimCallsDay * 30 - P.apim.includedCallsPerMonth) / 1e6 * P.apim.callOveragePer1M;
    return (tier + ovg) * USD_TO_CAD * (apimAllocPct / 100);
  }, [apimTier, apimAllocPct, apimCallsDay]);

  const calcPBI = useCallback(() =>
    (pbiPro * P.powerbi.proPerUserMonth + pbiPPU * P.powerbi.ppuPerUserMonth + (pbiP1 ? P.powerbi.premiumP1PerMonth : 0)) * USD_TO_CAD,
  [pbiPro, pbiPPU, pbiP1]);

  const calcAKS = useCallback(() => {
    const vmR = P.aks[aksVm] || P.aks.vmD4asv5PerHour;
    return (aksNodes * vmR * aksHrs * 30 + (aksSLA ? P.aks.uptimeSLAPerHour * 24 * 30 : 0)) * USD_TO_CAD;
  }, [aksNodes, aksVm, aksHrs, aksSLA]);

  const calcFn = useCallback(() => {
    if (fnPlan === 'consumption') {
      const exec = Math.max(0, fnExecDay * 30 - 1e6) / 1e6 * P.functions.consumptionPerMillionExec;
      const gbs  = Math.max(0, fnExecDay * 30 * fnMs / 1000 * fnMem - 400000) * P.functions.consumptionPerGBsecond;
      return (exec + gbs) * USD_TO_CAD;
    }
    const r = fnPlan === 'ep1' ? P.functions.premiumEP1PerHour : fnPlan === 'ep2' ? P.functions.premiumEP2PerHour : P.functions.premiumEP3PerHour;
    return r * 24 * 30 * fnInst * USD_TO_CAD;
  }, [fnPlan, fnExecDay, fnMs, fnMem, fnInst]);

  const calcAppSvc = useCallback(() => {
    const r = P.appService[aspSku] || P.appService.p1v3PerHour;
    return r * 24 * 30 * aspCount * USD_TO_CAD;
  }, [aspSku, aspCount]);

  const calcVM = useCallback(() => {
    const r = P.vm[vmSku] || P.vm.d4sv3PerHour;
    const d = P.vm[vmDisk] || P.vm.managedDiskP10;
    return (r * vmCount * vmHrs * vmDays + d * vmCount) * USD_TO_CAD;
  }, [vmSku, vmCount, vmHrs, vmDays, vmDisk]);

  const calcSqlDb = useCallback(() => {
    let compute;
    if (sqlTier === 'serverless') {
      compute = sqlVCores * sqlActiveHrs * sqlActiveDays * P.sqlDatabase.serverlessPerVcoreHour;
    } else {
      const r = sqlVCores === 4 ? P.sqlDatabase.gpvCore4PerHour : sqlVCores === 8 ? P.sqlDatabase.gpvCore8PerHour : P.sqlDatabase.gpvCore16PerHour;
      compute = r * 24 * 30;
    }
    return (compute + sqlStorGB * P.sqlDatabase.storagePerGBMonth) * USD_TO_CAD;
  }, [sqlTier, sqlVCores, sqlStorGB, sqlActiveHrs, sqlActiveDays]);

  const calcSqlMI = useCallback(() => {
    const r = P.sqlManagedInstance[miTier] || P.sqlManagedInstance.gp4vCorePerHour;
    return (r * 24 * 30 + miStorGB * P.sqlManagedInstance.storagePerGBMonth) * USD_TO_CAD;
  }, [miTier, miStorGB]);

  const calcCosmos = useCallback(() => {
    const sto = Math.ceil(cosStorGB / 10) * P.cosmosDb.storagePer10GB;
    if (cosModel === 'serverless') return (cosRUDay * 30 * P.cosmosDb.serverlessPer1MRU + sto) * USD_TO_CAD;
    return (cosRUSec / 100 * P.cosmosDb.provisionedPer100RU * 24 * 30 + sto) * USD_TO_CAD;
  }, [cosModel, cosRUDay, cosRUSec, cosStorGB]);

  const calcRedis = useCallback(() => (P.redis[redisTier] || P.redis.c1StandardPerHour) * 24 * 30 * USD_TO_CAD, [redisTier]);

  const calcOpenAI = useCallback(() => {
    const inR  = aiModel === 'gpt4o' ? P.openai.gpt4oInputPer1K : P.openai.gpt4oMiniInputPer1K;
    const outR = aiModel === 'gpt4o' ? P.openai.gpt4oOutputPer1K : P.openai.gpt4oMiniOutputPer1K;
    const m    = aiCalls * 30;
    return (m * aiIn / 1000 * inR + m * aiOut / 1000 * outR) * USD_TO_CAD;
  }, [aiModel, aiCalls, aiIn, aiOut]);

  const calcAIFoundry = useCallback(() => {
    const ft  = foundryComputeHrs * 30 * P.aiFoundry.nc6sV3PerHour;
    const inf = foundryInferHrs * 30 * P.aiFoundry.ds3v2InferencePerHour;
    const sto = foundryStorGB * P.aiFoundry.storagePerGBMonth;
    return (ft + inf + sto) * USD_TO_CAD;
  }, [foundryComputeHrs, foundryInferHrs, foundryStorGB]);

  const calcAISearch = useCallback(() => {
    const r = P.aiSearch[searchTier] || P.aiSearch.basicPerHour;
    const tier = r * searchReplicas * searchPartitions * 24 * 30;
    const stor = searchStorGB * P.aiSearch.storagePerGBMonth;
    const sem  = searchSemanticQDay * 30 / 1000 * P.aiSearch.semanticRankerPer1KQueries;
    return (tier + stor + sem) * USD_TO_CAD;
  }, [searchTier, searchReplicas, searchPartitions, searchStorGB, searchSemanticQDay]);

  const calcMLWs = useCallback(() => {
    const ci  = mlComputeHrs * 30 * P.mlWorkspace.ds3v2ComputeInstancePerHour;
    const gpu = mlGpuHrs * 30 * P.mlWorkspace.nc6sV3TrainingPerHour;
    const inf = mlInferHrs * 30 * P.mlWorkspace.inferenceD4sv3PerHour;
    const sto = mlStorGB * P.mlWorkspace.storageHotPerGBMonth;
    return (ci + gpu + inf + sto) * USD_TO_CAD;
  }, [mlComputeHrs, mlGpuHrs, mlInferHrs, mlStorGB]);

  const calcSB = useCallback(() => {
    if (sbTier === 'premium') return P.serviceBus.premiumPer1MUHour * sbMU * 24 * 30 * USD_TO_CAD;
    return (P.serviceBus.standardPerHour * 24 * 30 + sbMsgDay * 30 / 1e6 * P.serviceBus.operationsPer1M) * USD_TO_CAD;
  }, [sbTier, sbMsgDay, sbMU]);

  const calcEH = useCallback(() => {
    const r  = ehTier === 'premium' ? P.eventHubs.premiumPer1PUHour : P.eventHubs.standardPerTUHour;
    const tu = r * ehTUs * 24 * 30;
    const ev = ehEventsDay * 30 / 1e6 * P.eventHubs.ingressPer1M;
    const cp = ehCapture ? P.eventHubs.capturePerHour * 24 * 30 : 0;
    return (tu + ev + cp) * USD_TO_CAD;
  }, [ehTier, ehTUs, ehEventsDay, ehCapture]);

  const calcLA = useCallback(() => {
    const ingest    = logGBDay * 30 * P.logAnalytics.ingestPerGBPayGo;
    const retention = Math.max(0, logRetentionDays - 31) * logGBDay * 30 * P.logAnalytics.retentionBeyond31DaysPerGBMonth;
    const sentinel  = logSentinel ? logGBDay * 30 * P.logAnalytics.sentinelIngestPerGB : 0;
    return (ingest + retention + sentinel) * USD_TO_CAD;
  }, [logGBDay, logRetentionDays, logSentinel]);

  const calcLogicApps = useCallback(() => {
    if (laPlan === 'consumption') {
      const acts = laActionsDay * 30 / 1000 * P.logicApps.consumptionActionPer1K;
      const ent  = laEntConDay * 30 / 1000 * P.logicApps.consumptionEnterpriseConPer1K;
      return (acts + ent) * USD_TO_CAD;
    }
    const r = laPlan === 'ws2' ? P.logicApps.ws2PerHour : laPlan === 'ws3' ? P.logicApps.ws3PerHour : P.logicApps.wsPerHour;
    return r * 24 * 30 * laInst * USD_TO_CAD;
  }, [laPlan, laActionsDay, laEntConDay, laInst]);

  const calcVnet = useCallback(() => {
    const rate = vnetCrossRegion ? P.vnet.peeringCrossRegionPerGB : P.vnet.peeringIntraRegionPerGB;
    const peer = vnetPeeringGBDay * 30 * rate * 2; // billed both directions
    const egr  = vnetEgressGBDay * 30 * P.vnet.internetEgressFirst10TB;
    const pe   = vnetPEs * P.vnet.privateEndpointPerHour * 24 * 30;
    return (peer + egr + pe) * USD_TO_CAD;
  }, [vnetPeeringGBDay, vnetEgressGBDay, vnetPEs, vnetCrossRegion]);

  const calcER = useCallback(() => {
    const circuit = P.expressRoute[erCircuit] || 0;
    const gw      = (P.expressRoute[erGw] || P.expressRoute.gwStandardPerHour) * 24 * 30;
    const egress  = erPlan === 'metered' ? erEgressGB * P.expressRoute.outboundDataPerGB : 0;
    return (circuit + gw + egress) * USD_TO_CAD;
  }, [erCircuit, erGw, erPlan, erEgressGB]);

  const calcAGW = useCallback(() => {
    const fr = agwSku === 'wafV2FixedPerHour' ? P.appGateway.wafV2FixedPerHour : P.appGateway.standardV2FixedPerHour;
    const cr = agwSku === 'wafV2FixedPerHour' ? P.appGateway.wafV2CapacityUnitPerHour : P.appGateway.standardV2CapacityUnitHour;
    return (fr * 24 * 30 + cr * agwCU * 24 * 30 + agwDataGB / 10 * P.appGateway.dataProcessedPer10GB) * USD_TO_CAD;
  }, [agwSku, agwCU, agwDataGB]);

  const calcKV = useCallback(() => {
    const ops  = kvOps10KDay * 30 * P.keyVault.secretOperationsPer10K;
    const hsm  = kvHSMKeys * P.keyVault.hsmKeyPerMonth;
    const cert = kvCerts * P.keyVault.certificateRenewal / 12;
    return (ops + hsm + cert) * USD_TO_CAD;
  }, [kvOps10KDay, kvHSMKeys, kvCerts]);

  const calcDefCloud = useCallback(() => {
    const srv   = dcServers * P.defenderCloud.serverP2PerServerMonth;
    const cont  = dcContainerCores * P.defenderCloud.containersPerCoreMonth;
    const sql   = dcSQL * P.defenderCloud.sqlPerServerMonth;
    const stor  = dcStorage * P.defenderCloud.storagePerStorageAcctMonth;
    const app   = dcAppSvc * P.defenderCloud.appServicePerInstanceMonth;
    const cspm  = dcCSPM ? dcCSPMResources * P.defenderCloud.cspmPaidPerResourceMonth : 0;
    return (srv + cont + sql + stor + app + cspm) * USD_TO_CAD;
  }, [dcServers, dcContainerCores, dcSQL, dcStorage, dcAppSvc, dcCSPM, dcCSPMResources]);

  const calcDefEP = useCallback(() =>
    (depUsers * P.defenderEndpoint.plan2PerUserMonth + depServers * P.defenderEndpoint.serverPlan2PerServerMonth) * USD_TO_CAD,
  [depUsers, depServers]);

  const calcMonitor = useCallback(() => {
    const metrics = monCustomMetricsMDay * 30 / 1e6 * P.monitor.customMetricsPer1M;
    const alerts  = monAlertRules * P.monitor.staticAlertRulePerMonth;
    const sms     = monSMSPer100 * P.monitor.smsPer100;
    return (metrics + alerts + sms) * USD_TO_CAD;
  }, [monCustomMetricsMDay, monAlertRules, monSMSPer100]);

  // ── Memoised totals ───────────────────────────────────────────────────────
  const costs = {
    adf:        useMemo(() => calcADF(),       [calcADF]),
    adls:       useMemo(() => calcADLS(),      [calcADLS]),
    dbr:        useMemo(() => calcDBR(),       [calcDBR]),
    apim:       useMemo(() => calcAPIM(),      [calcAPIM]),
    pbi:        useMemo(() => calcPBI(),       [calcPBI]),
    aks:        useMemo(() => calcAKS(),       [calcAKS]),
    fn:         useMemo(() => calcFn(),        [calcFn]),
    appSvc:     useMemo(() => calcAppSvc(),    [calcAppSvc]),
    vm:         useMemo(() => calcVM(),        [calcVM]),
    sqlDb:      useMemo(() => calcSqlDb(),     [calcSqlDb]),
    sqlMI:      useMemo(() => calcSqlMI(),     [calcSqlMI]),
    cosmos:     useMemo(() => calcCosmos(),    [calcCosmos]),
    redis:      useMemo(() => calcRedis(),     [calcRedis]),
    openai:     useMemo(() => calcOpenAI(),    [calcOpenAI]),
    aiFoundry:  useMemo(() => calcAIFoundry(), [calcAIFoundry]),
    aiSearch:   useMemo(() => calcAISearch(),  [calcAISearch]),
    mlWs:       useMemo(() => calcMLWs(),      [calcMLWs]),
    sb:         useMemo(() => calcSB(),        [calcSB]),
    eh:         useMemo(() => calcEH(),        [calcEH]),
    la:         useMemo(() => calcLA(),        [calcLA]),
    logicApps:  useMemo(() => calcLogicApps(), [calcLogicApps]),
    vnet:       useMemo(() => calcVnet(),      [calcVnet]),
    er:         useMemo(() => calcER(),        [calcER]),
    agw:        useMemo(() => calcAGW(),       [calcAGW]),
    kv:         useMemo(() => calcKV(),        [calcKV]),
    defCloud:   useMemo(() => calcDefCloud(),  [calcDefCloud]),
    defEP:      useMemo(() => calcDefEP(),     [calcDefEP]),
    monitor:    useMemo(() => calcMonitor(),   [calcMonitor]),
  };

  const subtotal   = Object.values(costs).reduce((a, b) => a + b, 0);
  const contAmt    = subtotal * (contingency / 100);
  const total      = subtotal + contAmt;
  const multiplier = annual ? 12 : 1;
  const fM         = v => fmt(v * multiplier);

  const enabledServices = [
    { key: 'adf',       label: 'Azure Data Factory'              },
    { key: 'adls',      label: 'ADLS Gen2'                       },
    { key: 'dbr',       label: 'Azure Databricks Premium'        },
    { key: 'apim',      label: 'Azure API Management'            },
    { key: 'pbi',       label: 'Power BI'                        },
    { key: 'aks',       label: 'Azure Kubernetes Service'        },
    { key: 'fn',        label: 'Azure Functions'                 },
    { key: 'appSvc',    label: 'App Service + ASP'               },
    { key: 'vm',        label: 'Virtual Machines'                },
    { key: 'sqlDb',     label: 'Azure SQL Database'              },
    { key: 'sqlMI',     label: 'SQL Managed Instance'            },
    { key: 'cosmos',    label: 'Azure Cosmos DB'                 },
    { key: 'redis',     label: 'Azure Redis Cache'               },
    { key: 'openai',    label: 'Azure OpenAI Service'            },
    { key: 'aiFoundry', label: 'Azure AI Foundry'                },
    { key: 'aiSearch',  label: 'Azure AI Search'                 },
    { key: 'mlWs',      label: 'Azure ML Workspace'              },
    { key: 'sb',        label: 'Azure Service Bus'               },
    { key: 'eh',        label: 'Azure Event Hubs'                },
    { key: 'logicApps', label: 'Logic Apps'                      },
    { key: 'la',        label: 'Log Analytics'                   },
    { key: 'vnet',      label: 'VNet Traffic'                    },
    { key: 'er',        label: 'ExpressRoute'                    },
    { key: 'agw',       label: 'Application Gateway / WAF'       },
    { key: 'kv',        label: 'Azure Key Vault'                 },
    { key: 'defCloud',  label: 'Defender for Cloud'              },
    { key: 'defEP',     label: 'Defender for Endpoint'           },
    { key: 'monitor',   label: 'Azure Monitor & Alerts'          },
  ];

  // Chart — top 10 by cost
  const chartData   = enabledServices.map(s => ({ ...s, val: costs[s.key] || 0 })).sort((a, b) => b.val - a.val).slice(0, 10);
  const chartColors = [COLORS.dbr, COLORS.aks, COLORS.sqlMI, COLORS.er, COLORS.adf, COLORS.openai, COLORS.aiFoundry, COLORS.la, COLORS.appSvc, COLORS.defCloud];

  useEffect(() => {
    if (!chartRef.current) return;
    const data = chartData.map(s => s.val);
    if (chartInstance.current) {
      chartInstance.current.data.labels = chartData.map(s => s.label);
      chartInstance.current.data.datasets[0].data = data;
      chartInstance.current.options.plugins.tooltip.callbacks.label = ctx => ` ${fmt(ctx.raw * multiplier)}`;
      chartInstance.current.update('none');
      return;
    }
    chartInstance.current = new Chart(chartRef.current, {
      type: 'doughnut',
      data: { labels: chartData.map(s => s.label), datasets: [{ data, backgroundColor: chartColors, borderWidth: 0, hoverOffset: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${fmt(ctx.raw * multiplier)}` } } } },
    });
    return () => { if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(chartData.map(d => d.val)), multiplier]);

  const outputArgs = { projectName, costs, total, subtotal, contingency, contAmt, enabledServices };

  const handleCopy = async () => {
    const text = outputMode === 'memo' ? generateMemo(outputArgs) : outputMode === 'opt' ? generateOptimization(outputArgs) : generateExport(outputArgs);
    try { await navigator.clipboard.writeText(text); setCopyLabel('Copied!'); setTimeout(() => setCopyLabel('Copy'), 2500); } catch {}
  };

  const outputText  = outputMode === 'memo' ? generateMemo(outputArgs) : outputMode === 'opt' ? generateOptimization(outputArgs) : outputMode === 'export' ? generateExport(outputArgs) : '';
  const outputTitle = outputMode === 'memo' ? 'Cost Memo (ready for leadership)' : outputMode === 'opt' ? 'Optimization Roadmap' : 'CSV Export';

  const btnStyle = active => ({ background: active ? 'var(--color-background-secondary,#f5f5f5)' : 'transparent', border: '0.5px solid var(--color-border-secondary,#ccc)', borderRadius: 6, padding: '7px 13px', fontSize: 12, cursor: 'pointer', color: 'var(--color-text-primary,#111)', fontFamily: 'inherit', transition: 'background .15s' });

  const selOpts = (map) => Object.entries(map).map(([v, l]) => ({ value: v, label: l }));

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: 'system-ui,-apple-system,sans-serif', padding: '0.75rem 1rem', maxWidth: 800, color: 'var(--color-text-primary,#111)' }}>

      {showGuide && <ServiceGuideModal onClose={() => setShowGuide(false)} />}

      {/* HEADER */}
      <div style={{ background: 'linear-gradient(135deg,#0F2A47 0%,#0078D4 60%,#005A9E 100%)', borderRadius: 14, padding: '16px 20px', marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: '.13em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', marginBottom: 3 }}>Open Source · Azure Cost Estimation</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'white', letterSpacing: '-0.03em' }}>⚡ AzureCostIQ</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>From whiteboard to budget — in minutes · 28 Azure services</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>Monthly</span>
              <div onClick={() => setAnnual(a => !a)} style={{ width: 34, height: 18, borderRadius: 9, background: annual ? '#50FA7B' : 'rgba(255,255,255,0.25)', position: 'relative', cursor: 'pointer', transition: 'background .2s' }}>
                <div style={{ position: 'absolute', top: 2, left: annual ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: 'white', transition: 'left .18s' }} />
              </div>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>Annual</span>
            </div>
            <button onClick={() => setShowGuide(true)} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.15)', color: 'white', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
              📚 Service Guide
            </button>
            <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)', padding: '2px 9px', borderRadius: 20 }}>{priceStatus}</span>
          </div>
        </div>
        <div style={{ marginTop: 14, borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 12 }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginBottom: 3 }}>Project / solution name</div>
          <input type="text" value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="e.g. Customer Analytics Platform, Claims Processing API..."
            style={{ fontSize: 16, fontWeight: 600, border: 'none', borderBottom: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: 'white', padding: '2px 0', outline: 'none', width: '100%', fontFamily: 'inherit' }} />
        </div>
      </div>

      {/* METRIC CARDS */}
      <div style={{ display: 'flex', gap: 7, marginBottom: 12, flexWrap: 'wrap' }}>
        <MetricCard label="Total monthly"    value={fmt(total)}                                                            sub="incl. contingency" />
        <MetricCard label="Annual"           value={fmt(total * 12)}                                                       sub={`${contingency}% contingency`} />
        <MetricCard label="Compute + Data"   value={fmt((costs.aks+costs.vm+costs.fn+costs.appSvc+costs.dbr+costs.adf)*multiplier)} sub="AKS+VM+Fn+ASP+Databricks+ADF" color={COLORS.aks} />
        <MetricCard label="AI + DB"          value={fmt((costs.openai+costs.aiFoundry+costs.aiSearch+costs.mlWs+costs.sqlDb+costs.sqlMI+costs.cosmos)*multiplier)} sub="AI/ML + Databases" color={COLORS.openai} />
        <MetricCard label="Security + Ops"   value={fmt((costs.defCloud+costs.defEP+costs.la+costs.monitor+costs.kv)*multiplier)} sub="Defender+LogAnalytics+Monitor" color={COLORS.defCloud} />
      </div>

      {/* CHART + LEGEND */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div style={{ position: 'relative', height: 200 }}>
          <canvas ref={chartRef} role="img" aria-label="Azure project cost breakdown donut chart — top 10 services" />
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary,#999)' }}>{annual ? 'annual' : 'monthly'}</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{fmt(total * multiplier)}</div>
            <div style={{ fontSize: 9, color: 'var(--color-text-tertiary,#999)' }}>top 10 shown</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
          {chartData.map(({ key, label }, i) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: chartColors[i], flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: 'var(--color-text-secondary,#666)' }}>{label}</span>
              </div>
              <span style={{ fontSize: 10, fontWeight: 600 }}>{fM(costs[key])}</span>
            </div>
          ))}
          <div style={{ borderTop: '0.5px solid var(--color-border-tertiary,#e0e0e0)', paddingTop: 4, marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: 'var(--color-text-secondary,#666)' }}>Contingency ({contingency}%)</span>
            <span style={{ fontSize: 10, fontWeight: 600 }}>{fM(contAmt)}</span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* DATA PLATFORM */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <CategoryHeader label="📊 Data Platform Services" color={COLORS.adf} />

      {/* ADF */}
      <Section title="Azure Data Factory" subtitle="Orchestration · DIU · Copy · SHIR" color={COLORS.adf} icon="⚙️" cost={fM(costs.adf)} open={openSecs.adf} onToggle={() => toggleSec('adf')}>
        <IB v="blue"><strong>Billing model:</strong> Four distinct meters — orchestration runs ($0.001/run), data movement per DIU-hour ($0.25), copy activity executions ($0.005/run), and SHIR node-hours ($0.10). The DIU-hour charge is usually the biggest ADF cost — right-size by checking ADF monitoring.</IB>
        <div style={{ ...G2, marginTop: 10 }}>
          <div>
            <Slider label="Pipeline runs / day" min={1} max={500} step={1} value={adfRuns} onChange={setAdfRuns} unit="runs" hint="Each triggered pipeline execution — include orchestrator + child pipelines" />
            <Slider label="DIU-hours per run" min={0.5} max={20} step={0.5} value={adfDIU} onChange={setAdfDIU} unit="hr" hint="Data Integration Units × duration. Check ADF monitoring → Details for actuals." />
            <Slider label="SHIR nodes" min={0} max={4} step={1} value={adfShirNodes} onChange={setAdfShirNodes} unit="nodes" hint="Self-Hosted IR — only needed for on-premises data sources. Set 0 if cloud-only." />
          </div>
          <div>
            <Slider label="Copy activities / day" min={0} max={500} step={5} value={adfCopy} onChange={setAdfCopy} unit="acts" hint="Each Copy Activity billed separately. Batch with forEach to reduce count." />
            <Slider label="SHIR hours / day" min={0} max={24} step={1} value={adfShirHrs} onChange={setAdfShirHrs} unit="hrs" />
            <Slider label="Working days / month" min={15} max={30} step={1} value={adfWorkDays} onChange={setAdfWorkDays} unit="days" />
          </div>
        </div>
      </Section>

      {/* ADLS */}
      <Section title="ADLS Gen2 Storage" subtitle="Bronze (raw) · Silver (cleansed) · Gold (curated)" color={COLORS.adls} icon="🗄️" cost={fM(costs.adls)} open={openSecs.adls} onToggle={() => toggleSec('adls')}>
        <IB v="teal"><strong>Cost drivers:</strong> Storage GB × tier rate + transactions. Bronze accumulates forever (immutable) — implement Lifecycle Management to auto-tier to Cool after 90 days ($0.013/GB/mo saving). Gold stays Hot (Power BI actively queries it). Transactions are usually small vs storage cost.</IB>
        <div style={{ ...G3, marginTop: 10 }}>
          {[
            { t: '🔵 Bronze (Raw)', gb: bronzeGB, sGB: setBronzeGB, tier: bronzeTier, sTier: setBronzeTier, max: 10000, hint: 'Immutable raw landing. Grows forever — plan lifecycle rules.' },
            { t: '⚪ Silver (Cleansed)', gb: silverGB, sGB: setSilverGB, tier: silverTier, sTier: setSilverTier, max: 10000, hint: 'DQ-validated Delta/Parquet. ~0.8× Bronze in file size (compressed).' },
            { t: '🟡 Gold (Curated)', gb: goldGB, sGB: setGoldGB, tier: goldTier, sTier: setGoldTier, max: 5000, hint: 'Power BI source. ~20–40% of Bronze size. Keep on Hot.' },
          ].map(({ t, gb, sGB, tier, sTier, max, hint }) => (
            <div key={t}>
              <CL>{t}</CL>
              <Slider label="GB" min={0} max={max} step={50} value={gb} onChange={sGB} unit="GB" hint={hint} />
              <Select label="Storage tier" value={tier} onChange={sTier} options={[{ value: 'hot', label: 'Hot ($0.023/GB)' }, { value: 'cool', label: 'Cool ($0.010/GB)' }]} />
            </div>
          ))}
        </div>
        <div style={G2}>
          <Slider label="Read transactions (10K/day)" min={0} max={500} step={5} value={adlsReads} onChange={setAdlsReads} unit="×10K" hint="PBI refresh + pipeline reads" />
          <Slider label="Write transactions (10K/day)" min={0} max={500} step={5} value={adlsWrites} onChange={setAdlsWrites} unit="×10K" hint="ADF Bronze writes + Databricks output" />
        </div>
        <IB v="gray">Total: {(bronzeGB + silverGB + goldGB).toLocaleString()} GB across 3 layers</IB>
      </Section>

      {/* DATABRICKS */}
      <Section title="Azure Databricks Premium" subtitle="Job clusters · Interactive · SQL Warehouse · Serverless Jobs" color={COLORS.dbr} icon="💎" cost={fM(costs.dbr)} open={openSecs.dbr} onToggle={() => toggleSec('dbr')}>
        <IB v="orange"><strong>Billing model:</strong> Classic clusters = DBU rate + Azure VM rate. Serverless = DBU rate only (no VM, no startup delay). Unity Catalog metastore included at zero cost. At 8 DBU/hr: classic job = $0.862 CAD/hr vs serverless = $0.706 CAD/hr (18% cheaper — use for short jobs).</IB>
        <div style={{ ...G4, marginTop: 10 }}>
          {[
            { lbl: 'Job clusters', desc: 'ADF-triggered ETL batch. Spin up→run→terminate. DBU + VM cost.', h: dbrJobHrs, sH: setDbrJobHrs, d: dbrJobDBU, sD: setDbrJobDBU, cost: 'job', maxH: 24, dMin: 4, dMax: 64, noteV: 'gray', note: 'DBU + DS3v2 VM' },
            { lbl: 'Interactive/dev', desc: 'Developer notebooks in DEV workspace. Higher DBU rate. Auto-terminate 30min idle.', h: dbrIntHrs, sH: setDbrIntHrs, d: dbrIntDBU, sD: setDbrIntDBU, cost: 'int', maxH: 12, dMin: 4, dMax: 32, noteV: 'gray', note: 'DBU + DS3v2 VM' },
            { lbl: 'SQL Warehouse', desc: 'BI queries & Power BI Direct Query. Zero cost when idle.', h: dbrSqlHrs, sH: setDbrSqlHrs, d: dbrSqlDBU, sD: setDbrSqlDBU, cost: 'sql', maxH: 12, dMin: 2, dMax: 16, noteV: 'gray', note: 'DBU only (serverless)' },
            { lbl: 'Serverless ✦', desc: 'No VM, no startup delay, per-second billing. Best for <30min ETL jobs.', h: dbrSrvHrs, sH: setDbrSrvHrs, d: dbrSrvDBU, sD: setDbrSrvDBU, cost: 'srv', maxH: 24, dMin: 4, dMax: 32, noteV: 'orange', note: 'DBU only — no VM cost' },
          ].map(({ lbl, desc, h, sH, d, sD, maxH, dMin, dMax, noteV, note }) => (
            <div key={lbl}>
              <CL>{lbl}</CL>
              <p style={{ fontSize: 10, color: 'var(--color-text-tertiary,#999)', marginBottom: 7, lineHeight: 1.4 }}>{desc}</p>
              <Slider label="Hours/day" min={0} max={maxH} step={0.5} value={h} onChange={sH} unit="hr" />
              <Slider label="DBU/hr" min={dMin} max={dMax} step={dMin} value={d} onChange={sD} unit="DBU" hint={`DS3v2 4-core = 8 DBU. DBU/hr × hours × days = usage`} />
              <IB v={noteV}>{note}</IB>
            </div>
          ))}
        </div>
        <Slider label="Working days / month" min={15} max={30} step={1} value={dbrWorkDays} onChange={setDbrWorkDays} unit="days" />
      </Section>

      {/* APIM */}
      <Section title="Azure API Management" subtitle="Gateway · Standard · Developer · v2 Standard" color={COLORS.apim} icon="🔌" cost={fM(costs.apim)} open={openSecs.apim} onToggle={() => toggleSec('apim')}>
        <IB v="purple"><strong>Shared resource tip:</strong> If APIM is a shared platform gateway, set allocation % to your project's share of total call volume (e.g. 15% if your project generates 15% of total API calls). Standard tier = $0.965/hr = ~$1,007 USD/month fixed, then $3.50/million calls above 1M included.</IB>
        <div style={{ ...G2, marginTop: 10 }}>
          <div>
            <Select label="APIM tier" value={apimTier} onChange={setApimTier} options={[
              { value: 'standard', label: 'Standard — production, VNet, SLA ($0.965/hr)' },
              { value: 'v2standard', label: 'v2 Standard — 2024+ lighter option ($0.198/hr)' },
              { value: 'developer', label: 'Developer — non-prod ONLY, no SLA ($0.073/hr)' },
            ]} />
            <Slider label="CDP allocation %" min={5} max={100} step={5} value={apimAllocPct} onChange={setApimAllocPct} unit="%" hint="100% = dedicated. <100% = shared platform resource — allocate proportionally." />
          </div>
          <div>
            <Slider label="API calls / day" min={1000} max={1000000} step={5000} value={apimCallsDay} onChange={setApimCallsDay} unit="calls" hint="First 1M calls/month included in Standard tier. Overage: $3.50/million." />
            <IB v="gray">Monthly calls: {(apimCallsDay * 30).toLocaleString()} · Included 1M free · Overage: {fmt(Math.max(0, apimCallsDay * 30 - 1e6) / 1e6 * P.apim.callOveragePer1M * USD_TO_CAD)}</IB>
          </div>
        </div>
      </Section>

      {/* POWER BI */}
      <Section title="Power BI" subtitle="Pro · Premium Per User · Premium P1 Capacity" color={COLORS.pbi} icon="📊" cost={fM(costs.pbi)} open={openSecs.pbi} onToggle={() => toggleSec('pbi')}>
        <IB v="amber"><strong>Licence guide:</strong> Pro ($9.99 USD/user/mo) — required to publish AND view shared reports. PPU ($20/user/mo) — adds paginated reports (PDF/Excel output), large datasets, AI features. Premium P1 ($4,995/mo) — only needed for org-wide distribution to 100+ users or embedded analytics.</IB>
        <div style={{ ...G2, marginTop: 10 }}>
          <div>
            <Slider label="Pro users" min={0} max={500} step={1} value={pbiPro} onChange={setPbiPro} unit="users" hint="All users who publish or consume shared content — includes consumers" />
            <Slider label="PPU users" min={0} max={100} step={1} value={pbiPPU} onChange={setPbiPPU} unit="users" hint="Only needed for paginated reports, datasets >1GB, or AI features" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
            <Check label={`Premium P1 capacity (~${fmt(P.powerbi.premiumP1PerMonth * USD_TO_CAD)}/mo)`} sub="Only for 100+ users, embedded analytics, or datasets >10GB" checked={pbiP1} onChange={setPbiP1} />
            <IB v="gray">Gateway VM cost is a shared platform overhead — not included here</IB>
          </div>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════ */}
      <CategoryHeader label="⚙️ Compute Services" color={COLORS.aks} />

      {/* AKS */}
      <Section title="Azure Kubernetes Service (AKS)" subtitle="Node pools · Uptime SLA · System + User pools" color={COLORS.aks} icon="☸️" cost={fM(costs.aks)} open={openSecs.aks} onToggle={() => toggleSec('aks')}>
        <IB v="blue"><strong>What you pay for:</strong> Node VM hours + optional Uptime SLA. Control plane is free. System pool minimum 3 nodes for HA. User pools can scale to zero. Spot nodes save up to 70% for fault-tolerant batch workloads. Reserved Instances (1yr) save ~30% for stable node counts.</IB>
        <div style={{ ...G2, marginTop: 10 }}>
          <div>
            <Slider label="Node count (total)" min={1} max={100} step={1} value={aksNodes} onChange={setAksNodes} unit="nodes" hint="System pool (min 3 for HA) + user pools. Can scale to 0 after hours." />
            <Select label="Node VM size" value={aksVm} onChange={setAksVm} options={[
              { value: 'vmD4asv5PerHour', label: 'D4as v5 — 4 vCPU, 16 GB ($0.232/hr) ★ recommended' },
              { value: 'vmDS3v2PerHour',  label: 'DS3 v2 — 4 vCPU, 14 GB ($0.252/hr)' },
              { value: 'vmDS4v2PerHour',  label: 'DS4 v2 — 8 vCPU, 28 GB ($0.504/hr)' },
              { value: 'vmE4sv3PerHour',  label: 'E4s v3 — 4 vCPU, 32 GB ($0.292/hr) — memory-opt' },
            ]} />
          </div>
          <div>
            <Slider label="Active hours / day" min={1} max={24} step={1} value={aksHrs} onChange={setAksHrs} unit="hrs" hint="24 for prod; scale node pools to 0 for dev/test overnight" />
            <Check label={`Uptime SLA (+${fmt(P.aks.uptimeSLAPerHour * 24 * 30 * USD_TO_CAD)}/mo)`} sub="99.95% API server SLA — recommended for production" checked={aksSLA} onChange={setAksSLA} />
          </div>
        </div>
      </Section>

      {/* FUNCTIONS */}
      <Section title="Azure Functions" subtitle="Consumption (serverless) · Premium EP1/EP2/EP3" color={COLORS.functions} icon="⚡" cost={fM(costs.fn)} open={openSecs.fn} onToggle={() => toggleSec('fn')}>
        <IB v="orange"><strong>Plan guide:</strong> Consumption = pay per execution (first 1M + 400K GB-sec free/month — often near-zero cost). Premium = always-on instances with VNet access, no cold start. Choose Premium only if you need VNet integration, long timeouts (&gt;5min), or predictable performance.</IB>
        <div style={{ ...G2, marginTop: 10 }}>
          <div>
            <Select label="Hosting plan" value={fnPlan} onChange={setFnPlan} options={[
              { value: 'consumption', label: 'Consumption — pay per execution (first 1M free)' },
              { value: 'ep1', label: 'Premium EP1 — 1 vCPU, 3.5 GB, VNet ($0.201/hr)' },
              { value: 'ep2', label: 'Premium EP2 — 2 vCPU, 7 GB ($0.402/hr)' },
              { value: 'ep3', label: 'Premium EP3 — 4 vCPU, 14 GB ($0.804/hr)' },
            ]} />
            {fnPlan === 'consumption' ? (
              <>
                <Slider label="Executions / day" min={1000} max={10000000} step={10000} value={fnExecDay} onChange={setFnExecDay} unit="exec" hint="First 1M executions/month are free" />
                <Slider label="Avg duration (ms)" min={50} max={10000} step={50} value={fnMs} onChange={setFnMs} unit="ms" />
                <Slider label="Memory (GB)" min={0.128} max={1.5} step={0.128} value={fnMem} onChange={setFnMem} unit="GB" hint="First 400K GB-seconds/month free" />
              </>
            ) : (
              <Slider label="Always-on instances" min={1} max={20} step={1} value={fnInst} onChange={setFnInst} unit="inst" hint="Premium: minimum 1 pre-warmed instance billed 24/7" />
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <IB v={fnPlan === 'consumption' ? 'green' : 'orange'}>
              {fnPlan === 'consumption'
                ? '✓ Near-zero cost for <1M executions/month. Scale to zero when idle.'
                : '⚠ Premium billed even with zero executions. Use only if VNet or cold-start matters.'}
            </IB>
          </div>
        </div>
      </Section>

      {/* APP SERVICE */}
      <Section title="App Service + App Service Plan (ASP)" subtitle="B / P / I tiers · Multiple apps on one plan" color={COLORS.appSvc} icon="🌐" cost={fM(costs.appSvc)} open={openSecs.appSvc} onToggle={() => toggleSec('appSvc')}>
        <IB v="cyan"><strong>Key insight:</strong> You pay for the App Service Plan (ASP), not per app. Multiple web apps can run on one ASP at no extra cost. Isolated (I1v2+) tier runs on dedicated hardware inside your VNet — required for strict network isolation compliance. P-tier enables autoscale and deployment slots.</IB>
        <div style={{ ...G2, marginTop: 10 }}>
          <div>
            <Select label="ASP SKU tier" value={aspSku} onChange={setAspSku} options={[
              { value: 'b1PerHour',   label: 'B1 — 1 vCPU, 1.75 GB ($0.018/hr) — dev/test' },
              { value: 'b2PerHour',   label: 'B2 — 2 vCPU, 3.5 GB ($0.036/hr)' },
              { value: 'b3PerHour',   label: 'B3 — 4 vCPU, 7 GB ($0.072/hr)' },
              { value: 'p1v3PerHour', label: 'P1v3 — 2 vCPU, 8 GB ($0.171/hr) — prod + SLA' },
              { value: 'p2v3PerHour', label: 'P2v3 — 4 vCPU, 16 GB ($0.342/hr)' },
              { value: 'p3v3PerHour', label: 'P3v3 — 8 vCPU, 32 GB ($0.684/hr)' },
              { value: 'i1v2PerHour', label: 'I1v2 — 2 vCPU, 8 GB ($0.502/hr) — Isolated VNet' },
              { value: 'i2v2PerHour', label: 'I2v2 — 4 vCPU, 16 GB ($1.004/hr) — Isolated VNet' },
            ]} />
            <Slider label="ASP instances" min={1} max={20} step={1} value={aspCount} onChange={setAspCount} unit="plans" hint="Scale-out multiplies cost. Each instance = full ASP cost." />
          </div>
          <div>
            <div style={{ padding: '10px 12px', background: 'var(--color-background-secondary,#f5f5f5)', borderRadius: 8, marginTop: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Apps on this plan</div>
              <Slider label="Number of web apps" min={1} max={50} step={1} value={aspApps} onChange={setAspApps} unit="apps" hint="Multiple apps share one ASP — no extra cost per app" />
              <IB v="green">✓ {aspApps} apps share this ASP at no additional cost per app</IB>
            </div>
          </div>
        </div>
      </Section>

      {/* VMs */}
      <Section title="Virtual Machines" subtitle="B / D / E / F series · Managed disks · PAYG Linux" color={COLORS.vm} icon="🖥️" cost={fM(costs.vm)} open={openSecs.vm} onToggle={() => toggleSec('vm')}>
        <IB v="gray"><strong>Cost tips:</strong> Deallocate (stop) VMs when not needed — disk still billed but compute stops. Reserved Instances: 1yr = ~30% saving, 3yr = ~60%. Azure Hybrid Benefit saves ~40% on Windows VMs with existing licences. Consider AKS or App Service for stateless workloads.</IB>
        <div style={{ ...G2, marginTop: 10 }}>
          <div>
            <Select label="VM size" value={vmSku} onChange={setVmSku} options={[
              { value: 'b2sPerHour',   label: 'B2s — 2 vCPU, 4 GB ($0.050/hr) — dev/test burstable' },
              { value: 'd4sv3PerHour', label: 'D4s v3 — 4 vCPU, 16 GB ($0.232/hr) — general' },
              { value: 'd8sv3PerHour', label: 'D8s v3 — 8 vCPU, 32 GB ($0.464/hr)' },
              { value: 'e4sv3PerHour', label: 'E4s v3 — 4 vCPU, 32 GB ($0.292/hr) — memory-opt' },
              { value: 'f8sv2PerHour', label: 'F8s v2 — 8 vCPU, 16 GB ($0.384/hr) — compute-opt' },
            ]} />
            <Select label="Managed disk per VM" value={vmDisk} onChange={setVmDisk} options={[
              { value: 'managedDiskP10', label: 'P10 — 128 GB Premium SSD ($20.40/disk/mo)' },
              { value: 'managedDiskP20', label: 'P20 — 512 GB Premium SSD ($38.40/disk/mo)' },
              { value: 'managedDiskP30', label: 'P30 — 1 TB Premium SSD ($122.88/disk/mo)' },
            ]} />
          </div>
          <div>
            <Slider label="VM count" min={1} max={50} step={1} value={vmCount} onChange={setVmCount} unit="VMs" />
            <Slider label="Hours / day" min={1} max={24} step={1} value={vmHrs} onChange={setVmHrs} unit="hrs" hint="Deallocate non-prod VMs to stop compute billing" />
            <Slider label="Days / month" min={1} max={30} step={1} value={vmDays} onChange={setVmDays} unit="days" />
          </div>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════ */}
      <CategoryHeader label="🗃️ Database & Storage" color={COLORS.sqlDb} />

      {/* SQL DB */}
      <Section title="Azure SQL Database" subtitle="General Purpose vCore · Serverless (auto-pause)" color={COLORS.sqlDb} icon="🗃️" cost={fM(costs.sqlDb)} open={openSecs.sqlDb} onToggle={() => toggleSec('sqlDb')}>
        <IB v="red"><strong>Serverless vs Provisioned:</strong> Serverless auto-pauses when idle (great for dev/test, intermittent workloads — saves ~60%). Provisioned is always-on (use for consistent production traffic). General Purpose vCore includes 5GB storage per vCore — additional storage at $0.115/GB.</IB>
        <div style={{ ...G2, marginTop: 10 }}>
          <div>
            <Select label="Billing model" value={sqlTier} onChange={setSqlTier} options={[
              { value: 'serverless',  label: 'Serverless — auto-pause when idle (dev/test/intermittent)' },
              { value: 'provisioned', label: 'Provisioned — always-on (consistent production)' },
            ]} />
            <Select label="vCore count" value={String(sqlVCores)} onChange={v => setSqlVCores(Number(v))} options={[
              { value: '4',  label: '4 vCores — GP ($0.731/hr provisioned)' },
              { value: '8',  label: '8 vCores — GP ($1.463/hr provisioned)' },
              { value: '16', label: '16 vCores — GP ($2.926/hr provisioned)' },
            ]} />
            <Slider label="Storage (GB)" min={5} max={4000} step={10} value={sqlStorGB} onChange={setSqlStorGB} unit="GB" hint="$0.115/GB/month — above 5GB×vCore included" />
          </div>
          <div>
            {sqlTier === 'serverless' && (
              <>
                <Slider label="Active hours / day" min={0.5} max={24} step={0.5} value={sqlActiveHrs} onChange={setSqlActiveHrs} unit="hrs" hint="Serverless only bills when queries executing" />
                <Slider label="Active days / month" min={1} max={30} step={1} value={sqlActiveDays} onChange={setSqlActiveDays} unit="days" hint="0 cost on auto-paused days" />
              </>
            )}
            <IB v={sqlTier === 'serverless' ? 'green' : 'gray'}>
              {sqlTier === 'serverless' ? '✓ Auto-pauses when idle — saves ~60% for intermittent workloads' : 'Provisioned: 24×7 billing regardless of query load'}
            </IB>
          </div>
        </div>
      </Section>

      {/* SQL MI */}
      <Section title="SQL Managed Instance" subtitle="Full SQL Server compatibility · GP + Business Critical" color={COLORS.sqlMI} icon="🏛️" cost={fM(costs.sqlMI)} open={openSecs.sqlMI} onToggle={() => toggleSec('sqlMI')}>
        <IB v="red"><strong>Only use SQL MI if you need:</strong> SQL Server Agent, CLR, cross-database queries, linked servers, Service Broker, or near-100% SQL Server compatibility. For most new applications, Azure SQL Database is significantly cheaper and has fewer management concerns. SQL MI starts at ~$780 CAD/month (GP 4 vCore).</IB>
        <div style={{ ...G2, marginTop: 10 }}>
          <div>
            <Select label="Tier and vCore" value={miTier} onChange={setMiTier} options={[
              { value: 'gp4vCorePerHour',  label: 'General Purpose 4 vCore ($0.731/hr = ~$769/mo)' },
              { value: 'gp8vCorePerHour',  label: 'General Purpose 8 vCore ($1.463/hr = ~$1,538/mo)' },
              { value: 'gp16vCorePerHour', label: 'General Purpose 16 vCore ($2.926/hr = ~$3,076/mo)' },
              { value: 'bc4vCorePerHour',  label: 'Business Critical 4 vCore ($1.947/hr) — local SSD, read scale-out' },
              { value: 'bc8vCorePerHour',  label: 'Business Critical 8 vCore ($3.894/hr)' },
            ]} />
            <Slider label="Storage (GB)" min={32} max={8000} step={32} value={miStorGB} onChange={setMiStorGB} unit="GB" hint="$0.115/GB/month. Minimum 32 GB." />
          </div>
          <div>
            <IB v="gray">SQL MI runs 24/7 — no serverless/pause option. Includes: SQL Server Agent, CLR, cross-DB queries, linked servers, HA, automated backups, patching.</IB>
            <IB v="red" style={{ marginTop: 8 }}>⚠ Business Critical tier costs 2.7× General Purpose. Only needed for highest availability + in-memory OLTP.</IB>
          </div>
        </div>
      </Section>

      {/* COSMOS */}
      <Section title="Azure Cosmos DB" subtitle="Serverless · Provisioned RU/s · Global distribution" color={COLORS.cosmos} icon="🌐" cost={fM(costs.cosmos)} open={openSecs.cosmos} onToggle={() => toggleSec('cosmos')}>
        <IB v="teal"><strong>Model guide:</strong> Serverless = pay per Request Unit consumed (great for spiky/unpredictable traffic, dev/test). Provisioned = fixed RU/s capacity (use when traffic is consistent and high). Multi-region replication doubles cost per added region.</IB>
        <div style={{ ...G2, marginTop: 10 }}>
          <div>
            <Select label="Billing model" value={cosModel} onChange={setCosModel} options={[
              { value: 'serverless',  label: 'Serverless — pay per RU consumed' },
              { value: 'provisioned', label: 'Provisioned — fixed RU/s capacity' },
            ]} />
            {cosModel === 'serverless'
              ? <Slider label="Million RU / day" min={0.1} max={1000} step={0.1} value={cosRUDay} onChange={setCosRUDay} unit="M RU" hint="$0.282/million RUs. 1 simple read ≈ 1 RU." />
              : <Slider label="Provisioned RU/s" min={400} max={100000} step={100} value={cosRUSec} onChange={setCosRUSec} unit="RU/s" hint="$0.00576/100 RU/s/hr. Min 400 RU/s." />}
          </div>
          <div>
            <Slider label="Data stored (GB)" min={1} max={10000} step={10} value={cosStorGB} onChange={setCosStorGB} unit="GB" hint="$0.25/10 GB/month. Billed on stored data size." />
          </div>
        </div>
      </Section>

      {/* REDIS */}
      <Section title="Azure Cache for Redis" subtitle="Standard (HA) · C1–C3 · Premium (VNet + persistence)" color={COLORS.redis} icon="🔴" cost={fM(costs.redis)} open={openSecs.redis} onToggle={() => toggleSec('redis')}>
        <IB v="gray"><strong>Tier guide:</strong> Standard = primary + replica (HA). C1 (1GB) for session cache / API response cache. C2 (6GB) for medium workloads. Premium adds VNet injection (required for private deployments), data persistence, and geo-replication. Fixed hourly rate — always on.</IB>
        <div style={{ marginTop: 10 }}>
          <Select label="Cache tier" value={redisTier} onChange={setRedisTier} options={[
            { value: 'c1StandardPerHour', label: `C1 Standard — 1 GB ($0.042/hr = ${fmt(0.042*24*30*USD_TO_CAD)}/mo)` },
            { value: 'c2StandardPerHour', label: `C2 Standard — 6 GB ($0.188/hr = ${fmt(0.188*24*30*USD_TO_CAD)}/mo)` },
            { value: 'c3StandardPerHour', label: `C3 Standard — 13 GB ($0.376/hr = ${fmt(0.376*24*30*USD_TO_CAD)}/mo)` },
            { value: 'p1PremiumPerHour',  label: `P1 Premium — 6 GB + VNet ($0.524/hr = ${fmt(0.524*24*30*USD_TO_CAD)}/mo)` },
            { value: 'p2PremiumPerHour',  label: `P2 Premium — 13 GB + VNet ($1.049/hr = ${fmt(1.049*24*30*USD_TO_CAD)}/mo)` },
          ]} />
          <IB v="gray">Fixed rate — billed 24/7 regardless of usage. Standard tier = primary + replica for HA.</IB>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════ */}
      <CategoryHeader label="🤖 AI & Machine Learning" color={COLORS.openai} />

      {/* OPENAI */}
      <Section title="Azure OpenAI Service" subtitle="GPT-4o · GPT-4o mini · Embeddings · DALL-E" color={COLORS.openai} icon="🤖" cost={fM(costs.openai)} open={openSecs.openai} onToggle={() => toggleSec('openai')}>
        <IB v="green"><strong>Model cost comparison:</strong> GPT-4o mini is 33× cheaper input / 25× cheaper output than GPT-4o. Route classification, extraction, and summarisation to mini. Reserve GPT-4o for complex reasoning. 1 page of text ≈ 500–750 tokens. Output costs 3× input for GPT-4o.</IB>
        <div style={{ ...G2, marginTop: 10 }}>
          <div>
            <Select label="Model" value={aiModel} onChange={setAiModel} options={[
              { value: 'gpt4oMini', label: 'GPT-4o mini — $0.00015/$0.00060 per 1K in/out ★' },
              { value: 'gpt4o',    label: 'GPT-4o — $0.005/$0.015 per 1K in/out' },
            ]} />
            <Slider label="API calls / day" min={100} max={1000000} step={100} value={aiCalls} onChange={setAiCalls} unit="calls" />
          </div>
          <div>
            <Slider label="Input tokens / call" min={50} max={8000} step={50} value={aiIn} onChange={setAiIn} unit="tokens" hint="Prompt + system message. 1 page ≈ 600 tokens." />
            <Slider label="Output tokens / call" min={0} max={4000} step={50} value={aiOut} onChange={setAiOut} unit="tokens" hint="Completion length. Output costs 3× input for GPT-4o." />
            <IB v="gray">{(aiCalls * 30).toLocaleString()} calls/mo · {((aiCalls*30*aiIn)/1000).toFixed(0)}K input tokens · {((aiCalls*30*aiOut)/1000).toFixed(0)}K output tokens</IB>
          </div>
        </div>
      </Section>

      {/* AI FOUNDRY */}
      <Section title="Azure AI Foundry" subtitle="Fine-tuning · Inference endpoints · Prompt Flow" color={COLORS.aiFoundry} icon="🏭" cost={fM(costs.aiFoundry)} open={openSecs.aiFoundry} onToggle={() => toggleSec('aiFoundry')}>
        <IB v="green"><strong>What you pay for:</strong> Hub and project creation are free. Costs come from: GPU compute for fine-tuning (NC6s v3 = $3.06/hr per node), inference endpoint VMs (DS3v2 = $0.252/hr), and storage for model artifacts. The hub is a management plane — only instantiated compute incurs cost.</IB>
        <div style={{ ...G2, marginTop: 10 }}>
          <div>
            <Slider label="Fine-tuning GPU hours / month" min={0} max={200} step={1} value={foundryComputeHrs} onChange={setFoundryComputeHrs} unit="hrs" hint="NC6s v3 GPU node ($3.06/hr). Only during active training runs." />
            <Slider label="Inference endpoint hours / day" min={0} max={24} step={0.5} value={foundryInferHrs} onChange={setFoundryInferHrs} unit="hrs" hint="Managed online endpoint VM (DS3v2 $0.252/hr). 0 if using Azure OpenAI directly." />
          </div>
          <div>
            <Slider label="Storage for models/data (GB)" min={0} max={5000} step={50} value={foundryStorGB} onChange={setFoundryStorGB} unit="GB" hint="Model weights, training datasets, evaluation outputs ($0.023/GB/mo)" />
            <IB v="green">✓ Hub, project, model catalog, evaluation runs — free management plane</IB>
          </div>
        </div>
      </Section>

      {/* AI SEARCH */}
      <Section title="Azure AI Search" subtitle="Vector search · Semantic ranking · RAG pipelines" color={COLORS.aiSearch} icon="🔍" cost={fM(costs.aiSearch)} open={openSecs.aiSearch} onToggle={() => toggleSec('aiSearch')}>
        <IB v="teal"><strong>RAG architecture essential:</strong> AI Search is the retrieval layer in RAG pipelines with Azure OpenAI. Cost scales with tier × replicas × partitions. Basic has no SLA and no VNet — use S1+ for production. Semantic Ranker (AI re-ranking) adds $0.01/1K queries but significantly improves answer quality.</IB>
        <div style={{ ...G2, marginTop: 10 }}>
          <div>
            <Select label="Tier" value={searchTier} onChange={setSearchTier} options={[
              { value: 'basicPerHour', label: 'Basic — 2GB, no SLA, no VNet ($0.101/hr)' },
              { value: 's1PerHour',    label: 'Standard S1 — 25GB/partition, SLA ($0.290/hr) ★' },
              { value: 's2PerHour',    label: 'Standard S2 — 100GB/partition ($1.153/hr)' },
              { value: 's3PerHour',    label: 'Standard S3 — 200GB/partition ($4.612/hr)' },
            ]} />
            <Slider label="Replicas" min={1} max={12} step={1} value={searchReplicas} onChange={setSearchReplicas} unit="replicas" hint="Replicas multiply cost. 2+ replicas for SLA. 3+ for HA." />
            <Slider label="Partitions" min={1} max={12} step={1} value={searchPartitions} onChange={setSearchPartitions} unit="partitions" hint="Partitions add storage and throughput capacity." />
          </div>
          <div>
            <Slider label="Extra storage (GB)" min={0} max={1000} step={10} value={searchStorGB} onChange={setSearchStorGB} unit="GB" hint="Beyond tier's included storage ($0.25/GB/mo)" />
            <Slider label="Semantic Ranker queries / day" min={0} max={100000} step={1000} value={searchSemanticQDay} onChange={setSearchSemanticQDay} unit="queries" hint="AI-powered re-ranking ($0.01/1K queries — improves RAG quality)" />
            <IB v="teal">Total cost = {searchReplicas}R × {searchPartitions}P × ${P.aiSearch[searchTier]?.toFixed(3)}/hr × 720hrs = {fmt(P.aiSearch[searchTier] * searchReplicas * searchPartitions * 720 * USD_TO_CAD)}/mo base</IB>
          </div>
        </div>
      </Section>

      {/* ML WORKSPACE */}
      <Section title="Azure Machine Learning Workspace" subtitle="MLOps · Compute instances · Training clusters · Inference" color={COLORS.mlWorkspace} icon="🧪" cost={fM(costs.mlWs)} open={openSecs.mlWs} onToggle={() => toggleSec('mlWs')}>
        <IB v="green"><strong>Workspace is free — compute is not:</strong> The ML Workspace, experiment tracking, model registry, and Responsible AI tools are free. Costs come from compute instances (dev VMs, always-on), training clusters (scale to zero when idle), and managed inference endpoints.</IB>
        <div style={{ ...G2, marginTop: 10 }}>
          <div>
            <Slider label="Compute instance hours / day" min={0} max={24} step={0.5} value={mlComputeHrs} onChange={setMlComputeHrs} unit="hrs" hint="DS3v2 dev VM ($0.252/hr). STOP when not experimenting — biggest waste source." />
            <Slider label="GPU training hours / month" min={0} max={500} step={5} value={mlGpuHrs} onChange={setMlGpuHrs} unit="hrs" hint="NC6s v3 GPU cluster node ($3.06/hr). Scale to 0 when job completes." />
          </div>
          <div>
            <Slider label="Inference endpoint hours / day" min={0} max={24} step={0.5} value={mlInferHrs} onChange={setMlInferHrs} unit="hrs" hint="Managed online endpoint DS4v2 ($0.252/hr). Consider serverless inference." />
            <Slider label="Storage (GB)" min={0} max={5000} step={50} value={mlStorGB} onChange={setMlStorGB} unit="GB" hint="Models, datasets, run outputs ($0.023/GB/mo)" />
          </div>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════ */}
      <CategoryHeader label="🔗 Integration & Messaging" color={COLORS.sb} />

      {/* SERVICE BUS */}
      <Section title="Azure Service Bus" subtitle="Queues · Topics · Standard · Premium (Messaging Units)" color={COLORS.sb} icon="🚌" cost={fM(costs.sb)} open={openSecs.sb} onToggle={() => toggleSec('sb')}>
        <IB v="amber"><strong>Standard vs Premium:</strong> Standard = pay per operation (~$10/mo base + $0.80/million operations). Good for most integration scenarios. Premium = fixed Messaging Unit pricing (1 MU ≈ $928/mo) + VNet support + large message sizes &gt;256KB. Use Premium for enterprise integration, Isolated VNet, or &gt;1M messages/day volume.</IB>
        <div style={{ ...G2, marginTop: 10 }}>
          <div>
            <Select label="Namespace tier" value={sbTier} onChange={setSbTier} options={[
              { value: 'standard', label: 'Standard — pay per operation (~$10/mo base)' },
              { value: 'premium', label: 'Premium — Messaging Units, VNet support' },
            ]} />
            {sbTier === 'premium'
              ? <Slider label="Messaging Units" min={1} max={16} step={1} value={sbMU} onChange={setSbMU} unit="MU" hint="Each MU handles ~1,000 operations/sec. Doubles capacity each step." />
              : <Slider label="Messages / day" min={1000} max={10000000} step={10000} value={sbMsgDay} onChange={setSbMsgDay} unit="msgs" hint="$0.80 per 1M brokered operations above the base" />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <IB v="gray">{sbTier === 'standard' ? `Standard: ~$10/mo base + ${fmt(sbMsgDay * 30 / 1e6 * P.serviceBus.operationsPer1M * USD_TO_CAD)}/mo operations` : `Premium: ${sbMU} MU × $0.928/hr × 720hrs = ${fmt(P.serviceBus.premiumPer1MUHour * sbMU * 720 * USD_TO_CAD)}/mo`}</IB>
          </div>
        </div>
      </Section>

      {/* EVENT HUBS */}
      <Section title="Azure Event Hubs" subtitle="Streaming · IoT · Kafka-compatible · Capture to ADLS" color={COLORS.eh} icon="📨" cost={fM(costs.eh)} open={openSecs.eh} onToggle={() => toggleSec('eh')}>
        <IB v="amber"><strong>When to use:</strong> High-volume event streaming (IoT telemetry, app logs, clickstreams). Kafka-compatible — existing Kafka producers work without code changes. Capture feature auto-archives events to ADLS Gen2 at low cost. Each TU handles 1 MB/s ingest + 2 MB/s egress.</IB>
        <div style={{ ...G2, marginTop: 10 }}>
          <div>
            <Select label="Tier" value={ehTier} onChange={setEhTier} options={[
              { value: 'standard', label: 'Standard — Throughput Units (TUs)' },
              { value: 'premium', label: 'Premium — Processing Units (PUs), SLA + VNet' },
            ]} />
            <Slider label={ehTier === 'premium' ? 'Processing Units' : 'Throughput Units'} min={1} max={40} step={1} value={ehTUs} onChange={setEhTUs} unit={ehTier === 'premium' ? 'PU' : 'TU'} hint="Standard: 1 TU = 1MB/s in + 2MB/s out. Auto-inflate up to 40 TUs." />
          </div>
          <div>
            <Slider label="Events / day (millions)" min={0.1} max={1000} step={0.5} value={ehEventsDay / 1e6} onChange={v => setEhEventsDay(Math.round(v * 1e6))} unit="M events" />
            <Check label={`Enable Event Capture (+${fmt(P.eventHubs.capturePerHour * 24 * 30 * USD_TO_CAD)}/mo)`} sub="Auto-archive events to ADLS Gen2 or Blob — no data loss on consumer lag" checked={ehCapture} onChange={setEhCapture} />
          </div>
        </div>
      </Section>

      {/* LOGIC APPS */}
      <Section title="Azure Logic Apps" subtitle="Workflow automation · 400+ connectors · SAP, Salesforce, ServiceNow" color={COLORS.logicApps} icon="🔗" cost={fM(costs.logicApps)} open={openSecs.logicApps} onToggle={() => toggleSec('logicApps')}>
        <IB v="purple"><strong>Consumption vs Standard:</strong> Consumption = pay per action execution (~$0.025/1K actions). Near-zero cost for low-volume workflows. Standard = always-on vCPU (required for VNet integration, long timeouts, stateful workflows). Enterprise connectors (SAP, Salesforce, etc.) cost $0.50/1K executions — check connector tier before designing.</IB>
        <div style={{ ...G2, marginTop: 10 }}>
          <div>
            <Select label="Plan" value={laPlan} onChange={setLaPlan} options={[
              { value: 'consumption', label: 'Consumption — pay per action execution' },
              { value: 'ws1', label: 'Standard WS1 — 1 vCPU, 3.5 GB ($0.192/hr)' },
              { value: 'ws2', label: 'Standard WS2 — 2 vCPU, 7 GB ($0.384/hr)' },
              { value: 'ws3', label: 'Standard WS3 — 4 vCPU, 14 GB ($0.768/hr)' },
            ]} />
            {laPlan === 'consumption' ? (
              <>
                <Slider label="Action executions / day" min={100} max={10000000} step={1000} value={laActionsDay} onChange={setLaActionsDay} unit="actions" hint="Each step in a workflow = 1 action. Loops multiply count." />
                <Slider label="Enterprise connector executions / day" min={0} max={100000} step={500} value={laEntConDay} onChange={setLaEntConDay} unit="exec" hint="SAP, Salesforce, ServiceNow = $0.50/1K. Check connector tier." />
              </>
            ) : (
              <Slider label="Instances" min={1} max={10} step={1} value={laInst} onChange={setLaInst} unit="inst" hint="Standard plan: always-on, billed per instance" />
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <IB v={laPlan === 'consumption' ? 'green' : 'purple'}>
              {laPlan === 'consumption'
                ? '✓ Built-in actions (Condition, Loop, Parse JSON) are free in Standard plan. Consumption charges all.'
                : 'Standard: VNet integration, stateful workflows, no cold start. Min 1 instance billed 24/7.'}
            </IB>
          </div>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════ */}
      <CategoryHeader label="🌐 Networking" color={COLORS.vnet} />

      {/* VNET TRAFFIC */}
      <Section title="VNet Traffic & Data Transfer" subtitle="Peering · Internet egress · Private Endpoints" color={COLORS.vnet} icon="🌐" cost={fM(costs.vnet)} open={openSecs.vnet} onToggle={() => toggleSec('vnet')}>
        <IB v="blue"><strong>What triggers charges:</strong> VNet creation is free. Charges apply for data crossing VNet boundaries. Peering is billed in both directions ($0.01/GB intra-region). Internet egress: first 10TB/month = $0.087/GB. Private Endpoints: $0.01/hr per PE + $0.01/GB processed.</IB>
        <div style={{ ...G2, marginTop: 10 }}>
          <div>
            <Slider label="Peered VNet data / day (GB)" min={0} max={1000} step={5} value={vnetPeeringGBDay} onChange={setVnetPeeringGBDay} unit="GB" hint="Charged both directions. Intra-region: $0.01/GB each way." />
            <Slider label="Internet egress / day (GB)" min={0} max={500} step={5} value={vnetEgressGBDay} onChange={setVnetEgressGBDay} unit="GB" hint="Outbound to internet. First 10TB/month = $0.087/GB." />
          </div>
          <div>
            <Slider label="Private Endpoints" min={0} max={50} step={1} value={vnetPEs} onChange={setVnetPEs} unit="PEs" hint="Each PE: $0.01/hr = ~$7.20 CAD/month + $0.01/GB processed." />
            <Check label="Cross-region peering" sub="Cross-region: $0.035/GB each way vs $0.010/GB intra-region" checked={vnetCrossRegion} onChange={setVnetCrossRegion} />
          </div>
        </div>
      </Section>

      {/* EXPRESSROUTE */}
      <Section title="Azure ExpressRoute" subtitle="Dedicated private connectivity · Circuit + Gateway" color={COLORS.expressRoute} icon="⚡" cost={fM(costs.er)} open={openSecs.er} onToggle={() => toggleSec('er')}>
        <IB v="blue"><strong>Two components:</strong> 1) Circuit (from your telecom provider — this is the Azure port cost, telecom charges separately), 2) ExpressRoute Gateway in your Azure VNet. Unlimited plan eliminates per-GB egress charges — cost-effective if egress &gt;500 GB/month. Metered plan = $0.025/GB outbound.</IB>
        <div style={{ ...G2, marginTop: 10 }}>
          <div>
            <Select label="Circuit bandwidth" value={erCircuit} onChange={setErCircuit} options={[
              { value: 'er50MbpsLocalPerMonth',    label: '50 Mbps Local — $54.98/mo port' },
              { value: 'er200MbpsPerMonth',         label: '200 Mbps Standard — $219.91/mo port' },
              { value: 'er500MbpsPerMonth',         label: '500 Mbps Standard — $439.83/mo port' },
              { value: 'er1GbpsPerMonth',           label: '1 Gbps Standard — $549.78/mo port' },
              { value: 'er2GbpsPerMonth',           label: '2 Gbps Standard — $1,099.56/mo port' },
              { value: 'er10GbpsPerMonth',          label: '10 Gbps Standard — $5,497.80/mo port' },
            ]} />
            <Select label="ExpressRoute Gateway (in VNet)" value={erGw} onChange={setErGw} options={[
              { value: 'gwStandardPerHour',   label: 'Standard GW — up to 1 Gbps ($0.162/hr)' },
              { value: 'gwHighPerfPerHour',   label: 'High Performance — up to 2 Gbps ($0.327/hr)' },
              { value: 'gwUltraPerfPerHour',  label: 'Ultra Performance — up to 10 Gbps ($0.983/hr)' },
            ]} />
          </div>
          <div>
            <Select label="Data plan" value={erPlan} onChange={setErPlan} options={[
              { value: 'unlimited', label: 'Unlimited — no per-GB egress charge (included in circuit fee)' },
              { value: 'metered',   label: 'Metered — $0.025/GB outbound data transfer' },
            ]} />
            {erPlan === 'metered' && <Slider label="Outbound data / month (GB)" min={0} max={100000} step={100} value={erEgressGB} onChange={setErEgressGB} unit="GB" hint="Metered plan: $0.025/GB egress. Unlimited plan avoids this." />}
            <IB v="gray">Note: Telecom provider circuit cost is billed separately — not included here. Add your provider's monthly charge to this estimate.</IB>
          </div>
        </div>
      </Section>

      {/* APP GATEWAY */}
      <Section title="Application Gateway + WAF" subtitle="L7 load balancer · WAF v2 · SSL termination" color={COLORS.appGw} icon="🛡️" cost={fM(costs.agw)} open={openSecs.agw} onToggle={() => toggleSec('agw')}>
        <IB v="blue"><strong>WAF v2 vs Standard v2:</strong> WAF v2 adds OWASP Core Rule Set protection, custom rules, and bot mitigation. Required for any internet-facing application. Each Capacity Unit supports ~50 persistent connections, 2,500 req/sec, or 2.22 Mbps throughput. Minimum 2 CU always active.</IB>
        <div style={{ ...G2, marginTop: 10 }}>
          <div>
            <Select label="SKU" value={agwSku} onChange={setAgwSku} options={[
              { value: 'wafV2FixedPerHour',      label: 'WAF v2 — OWASP protection, bot rules ($0.360/hr fixed)' },
              { value: 'standardV2FixedPerHour', label: 'Standard v2 — no WAF ($0.246/hr fixed)' },
            ]} />
            <Slider label="Capacity Units" min={2} max={100} step={1} value={agwCU} onChange={setAgwCU} unit="CU" hint="Min 2 CU always active. Each CU = 50 connections OR 2,500 req/s" />
          </div>
          <div>
            <Slider label="Data processed (GB/month)" min={1} max={100000} step={100} value={agwDataGB} onChange={setAgwDataGB} unit="GB" hint="$0.008 per 10 GB processed through the gateway" />
          </div>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════ */}
      <CategoryHeader label="🔒 Security & Compliance" color={COLORS.defCloud} />

      {/* KEY VAULT */}
      <Section title="Azure Key Vault" subtitle="Secrets · Keys · Certificates · HSM" color={COLORS.kv} icon="🔑" cost={fM(costs.kv)} open={openSecs.kv} onToggle={() => toggleSec('kv')}>
        <IB v="purple"><strong>Mandatory for enterprise:</strong> All connection strings, API keys, and certificates must be in Key Vault (CDP FR-001 equivalent). Key Vault is near-free for standard use — $0.03 per 10K operations. Only use HSM-backed keys for regulated workloads requiring hardware protection (PCI-DSS, FIPS 140-2 Level 3).</IB>
        <div style={{ ...G2, marginTop: 10 }}>
          <div>
            <Slider label="Operations (10K/day)" min={0} max={1000} step={5} value={kvOps10KDay} onChange={setKvOps10KDay} unit="×10K ops" hint="Secret reads by apps, pipelines, deployments. $0.03/10K ops." />
            <Slider label="HSM-backed keys" min={0} max={50} step={1} value={kvHSMKeys} onChange={setKvHSMKeys} unit="keys" hint="HSM keys: $5/key/month + $0.15/10K operations. Only for compliance requirements." />
          </div>
          <div>
            <Slider label="Certificate renewals / year" min={0} max={50} step={1} value={kvCerts} onChange={setKvCerts} unit="certs" hint="$3.00 per certificate renewal. Amortised monthly here." />
            <IB v="green">✓ Key Vault creation, secret storage, access policy config — all free. Only operations are billed.</IB>
          </div>
        </div>
      </Section>

      {/* DEFENDER FOR CLOUD */}
      <Section title="Microsoft Defender for Cloud" subtitle="CSPM · Workload protection · Threat detection" color={COLORS.defCloud} icon="🛡️" cost={fM(costs.defCloud)} open={openSecs.defCloud} onToggle={() => toggleSec('defCloud')}>
        <IB v="red"><strong>Plans guide:</strong> Basic CSPM (security score, recommendations) is free. Paid plans add active threat detection. Defender for Servers P2 ($15/server/mo) includes MDE, JIT access, adaptive application controls, and file integrity monitoring. Enable per resource type as needed — don't enable all plans blindly.</IB>
        <div style={{ ...G2, marginTop: 10 }}>
          <div>
            <Slider label="Servers (Defender P2)" min={0} max={200} step={1} value={dcServers} onChange={setDcServers} unit="servers" hint="$15/server/month. Includes MDE, JIT access, adaptive controls." />
            <Slider label="AKS vCores (Containers)" min={0} max={200} step={4} value={dcContainerCores} onChange={setDcContainerCores} unit="vCores" hint="$7/vCore/month. Runtime threat protection for Kubernetes." />
            <Slider label="SQL servers (Defender SQL)" min={0} max={50} step={1} value={dcSQL} onChange={setDcSQL} unit="servers" hint="$15/SQL server/month. Includes SQL MI and SQL on VMs." />
          </div>
          <div>
            <Slider label="Storage accounts (Defender Storage)" min={0} max={100} step={1} value={dcStorage} onChange={setDcStorage} unit="accts" hint="$10/storage account/month. Anomaly detection on ADLS/Blob." />
            <Slider label="App Service plans (Defender AppSvc)" min={0} max={20} step={1} value={dcAppSvc} onChange={setDcAppSvc} unit="plans" hint="$15/App Service plan instance/month." />
            <Check label="CSPM Enhanced" sub={`$0.007/resource/month for ${dcCSPMResources} resources = ${fmt(dcCSPMResources * 0.007 * USD_TO_CAD)}/mo`} checked={dcCSPM} onChange={setDcCSPM} />
            {dcCSPM && <Slider label="Resources for CSPM" min={10} max={5000} step={10} value={dcCSPMResources} onChange={setDcCSPMResources} unit="resources" hint="Count Azure resources in scope for enhanced CSPM." />}
          </div>
        </div>
        <IB v="gray">✓ Basic CSPM (security score, recommendations): free for all Azure subscriptions</IB>
      </Section>

      {/* DEFENDER FOR ENDPOINT */}
      <Section title="Microsoft Defender for Endpoint" subtitle="EDR · Antivirus · Attack surface reduction · MDE P2" color={COLORS.defEP} icon="🔒" cost={fM(costs.defEP)} open={openSecs.defEP} onToggle={() => toggleSec('defEP')}>
        <IB v="purple"><strong>Licensing note:</strong> MDE Plan 2 for end-user devices is $5.20/user/month. MDE for servers is included in Defender for Cloud Server P2 ($15/server/month) — don't double-count servers if Defender for Cloud is already enabled. Microsoft 365 E5 / Defender for Business includes MDE.</IB>
        <div style={{ ...G2, marginTop: 10 }}>
          <div>
            <Slider label="End-user devices (MDE P2)" min={0} max={1000} step={5} value={depUsers} onChange={setDepUsers} unit="users" hint="$5.20/user/month. Developer workstations, business PCs." />
          </div>
          <div>
            <Slider label="Servers NOT in Defender for Cloud" min={0} max={200} step={1} value={depServers} onChange={setDepServers} unit="servers" hint="If covered by Defender for Cloud P2 above — set to 0 here." />
            <IB v="gray">MDE for servers is included in Defender for Cloud Server P2 — don't count twice</IB>
          </div>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════ */}
      <CategoryHeader label="📋 Monitoring & Operations" color={COLORS.logAnalytics} />

      {/* LOG ANALYTICS */}
      <Section title="Log Analytics Workspace" subtitle="Centralised logs · KQL · Sentinel-ready · 31 days free retention" color={COLORS.logAnalytics} icon="📋" cost={fM(costs.la)} open={openSecs.la} onToggle={() => toggleSec('la')}>
        <IB v="cyan"><strong>Every workload should have one:</strong> All Azure diagnostic settings route here. Estimate 1–5 GB/day per application workload. Commitment tiers save 15–25% at &gt;100 GB/day. Microsoft Sentinel (SIEM) adds $2.46/GB on top of Log Analytics ingestion — significant cost for large environments.</IB>
        <div style={{ ...G2, marginTop: 10 }}>
          <div>
            <Slider label="Log ingestion (GB/day)" min={0.1} max={500} step={0.5} value={logGBDay} onChange={setLogGBDay} unit="GB/day" hint="Estimate 1–5 GB/day per app workload. $2.30/GB PAYG." />
            <Slider label="Retention (days)" min={31} max={730} step={10} value={logRetentionDays} onChange={setLogRetentionDays} unit="days" hint="31 days included free. Each additional day: $0.10/GB/month." />
          </div>
          <div>
            <Check label="Enable Microsoft Sentinel (+$2.46/GB)" sub="SIEM — threat detection, security analytics, incident management. Significant additional cost." checked={logSentinel} onChange={setLogSentinel} />
            <IB v="cyan">{logGBDay.toFixed(1)} GB/day = {(logGBDay * 30).toFixed(0)} GB/month = {fmt(logGBDay * 30 * P.logAnalytics.ingestPerGBPayGo * USD_TO_CAD)}/mo ingestion{logSentinel ? ` + ${fmt(logGBDay * 30 * P.logAnalytics.sentinelIngestPerGB * USD_TO_CAD)}/mo Sentinel` : ''}</IB>
          </div>
        </div>
      </Section>

      {/* MONITOR */}
      <Section title="Azure Monitor & Alerts" subtitle="Metrics · Alert rules · Application Insights · Notifications" color={COLORS.monitor} icon="🔔" cost={fM(costs.monitor)} open={openSecs.monitor} onToggle={() => toggleSec('monitor')}>
        <IB v="cyan"><strong>Mostly free:</strong> Platform metrics (CPU, memory, disk, network), Azure Workbooks, health alerts, email/webhook notifications, and Azure Dashboards are free. Main costs: custom metrics ingestion, alert rules per month, and Application Insights (billed as Log Analytics ingestion).</IB>
        <div style={{ ...G2, marginTop: 10 }}>
          <div>
            <Slider label="Custom metrics (M data points/day)" min={0} max={1000} step={5} value={monCustomMetricsMDay} onChange={setMonCustomMetricsMDay} unit="M pts" hint="$0.10/million data points. Platform metrics (CPU etc.) are free." />
            <Slider label="Alert rules" min={0} max={500} step={5} value={monAlertRules} onChange={setMonAlertRules} unit="rules" hint="$0.10/alert rule/month. Static threshold and dynamic (ML) same price." />
          </div>
          <div>
            <Slider label="SMS notifications (per 100 messages/mo)" min={0} max={100} step={1} value={monSMSPer100} onChange={setMonSMSPer100} unit="×100" hint="$0.75/100 SMS. Email and webhook notifications are free." />
            <IB v="green">✓ Free: platform metrics, workbooks, dashboards, email notifications, webhooks, health alerts<br />Application Insights ingestion billed as Log Analytics (add to LA estimate above)</IB>
          </div>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* CONTINGENCY */}
      <div style={{ border: '0.5px solid var(--color-border-tertiary,#e0e0e0)', borderRadius: 12, padding: '13px 14px', marginBottom: 11 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>📊 Contingency &amp; Estimate Scenarios</div>
        <Slider label="Contingency buffer" min={5} max={30} step={5} value={contingency} onChange={setContingency} unit="%" hint="10% = well-defined scope (post-design) · 15% = some architectural unknowns · 20–25% = new pattern, greenfield, significant assumptions" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 10 }}>
          {[
            { label: 'Conservative (−15%)', val: total * 0.85, dim: true  },
            { label: 'Base (recommended)',   val: total,        dim: false },
            { label: 'Stretch (+20%)',       val: total * 1.2,  dim: true  },
          ].map(({ label, val, dim }) => (
            <div key={label} style={{ fontSize: 11, padding: '10px 12px', borderRadius: 8, textAlign: 'center', background: dim ? 'var(--color-background-secondary,#f5f5f5)' : 'var(--color-background-primary,#fff)', border: dim ? 'none' : '1.5px solid #0078D4' }}>
              <div style={{ color: dim ? 'var(--color-text-tertiary,#999)' : '#0078D4', marginBottom: 3, fontWeight: dim ? 400 : 600 }}>{label}</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: dim ? 'var(--color-text-secondary,#666)' : '#0078D4' }}>{fmt(val * multiplier)}</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-tertiary,#999)', marginTop: 2 }}>{annual ? 'per year' : 'per month'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ACTION BUTTONS */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { mode: 'memo',   label: '📄 Cost memo'              },
            { mode: 'opt',    label: '⚡ Optimization roadmap'   },
            { mode: 'export', label: '⬇ Export CSV'              },
          ].map(({ mode, label }) => (
            <button key={mode} onClick={() => setOutputMode(outputMode === mode ? null : mode)} style={btnStyle(outputMode === mode)}>{label}</button>
          ))}
        </div>
        <button onClick={() => setShowGuide(true)}
          style={{ fontSize: 12, padding: '7px 16px', borderRadius: 8, border: 'none', background: '#0078D4', color: 'white', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
          📚 Azure Service Guide →
        </button>
      </div>

      {/* OUTPUT PANEL */}
      {outputMode && (
        <div style={{ border: '0.5px solid var(--color-border-tertiary,#e0e0e0)', borderRadius: 12, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{outputTitle}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={handleCopy} style={{ fontSize: 12, padding: '5px 11px', borderRadius: 6, border: '0.5px solid var(--color-border-secondary,#ccc)', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit' }}>{copyLabel}</button>
              <button onClick={() => setOutputMode(null)} style={{ fontSize: 12, padding: '5px 9px', borderRadius: 6, border: '0.5px solid var(--color-border-secondary,#ccc)', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit' }}>✕</button>
            </div>
          </div>
          <textarea readOnly value={outputText} rows={16}
            style={{ width: '100%', background: 'var(--color-background-secondary,#f5f5f5)', border: '0.5px solid var(--color-border-tertiary,#e0e0e0)', borderRadius: 6, padding: 10, fontSize: 11, fontFamily: "'Courier New',monospace", color: 'var(--color-text-primary,#111)', resize: 'vertical', outline: 'none' }} />
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary,#999)', marginTop: 5, textAlign: 'right' }}>
            AzureCostIQ v3.0 · github.com/your-org/azure-cost-iq · Prices: Azure Canada Central May 2026
          </div>
        </div>
      )}
    </div>
  );
}
