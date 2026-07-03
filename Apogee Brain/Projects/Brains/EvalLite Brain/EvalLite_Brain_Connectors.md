---
tags:
  - evalite
  - apogeeskope
  - connectors
  - integration
created: 2026-06-17
status: Sub-node — data connectors & integration
---

# EvalLite Brain – Connectors

> The **HOW** behind the Master Note's *Technology Stack → Integrations*. Lightweight, low-friction ingestion is the core adoption bet — onboarding must stay **under 30 minutes** (Master Note: Adoption Risk mitigation).

Parent: [[EvalLite Brain – Obsidian Master Note]] · Feeds [[EvalLite_Brain_Data_Model]] · Quality-gated by [[EvalLite_Brain_Test_Results]]

---

## Phased Integration Roadmap (from Master Note)
| Phase | Connector | Pulls | Auth | Cadence |
|---|---|---|---|---|
| **1** | Google Sheets | Budgets, outreach counts, manual KPIs | OAuth | On-demand / daily |
| **1** | Excel | Tabular NGO/SME records | File upload | Manual |
| **1** | CSV | Any tabular export | File upload | Manual |
| **2** | WhatsApp Business | Message reach, delivery & response rates | API token | Hourly |
| **2** | M-Pesa Daraja | Transactions, disbursements, cost data | OAuth + shortcode | Daily |
| **2** | KoboToolbox | Field survey & beneficiary data | API token | Daily |
| **2** | SurveyCTO | Structured field-survey datasets | API key | Daily |
| **3** | Salesforce | CRM, program & donor records | OAuth | Daily |
| **3** | Power BI | Hand-off / two-way BI exchange | OAuth | Scheduled |
| **3** | Meta Ads | Campaign reach, spend (CAC inputs) | OAuth | Daily |
| **3** | Google Analytics | Web/landing conversions | OAuth | Daily |

> Phases mirror the Master Note exactly: **P1 = Sheets/Excel/CSV**, **P2 = WhatsApp/M-Pesa/Kobo/SurveyCTO**, **P3 = Salesforce/Power BI/Meta Ads/GA**.

---

## Ingestion Flow
```
Source (P1 files → P2 field/mobile money → P3 CRM/BI/ads)
        │  pull on cadence
        ▼
  Connector adapter ──► validation + Data Quality Scoring ──► PostgreSQL store
        │                         │
        │                         └─ quality flags ──► EvalLite_Brain_Test_Results
        ▼
  normalized metrics ──► EvalLite_Brain_Data_Model ──► engines (ROI / Predictive / SII)
```

---

## Connector Spec (each adapter defines)
- **Field map** → Data Model inputs (Reach, Cost/Beneficiary, Conversion, Retention, spend).
- **Auth method** & encrypted secret storage; least-privilege scopes.
- **Refresh cadence** + retry/failure handling.
- **Data Quality Scoring** (nulls, ranges, duplicates) → flags routed to [[EvalLite_Brain_Test_Results]] (Master Note: Data Quality Risk mitigation).

---

## Security & Compliance
- Secrets encrypted at rest; per-client data isolation; full audit log of every pull.
- Minimise PII at ingestion — store aggregates, not identities.
- Hosted on AWS / Azure per Master Note Technology Stack.

---

## Related
- [[EvalLite_Brain_Data_Model]]
- [[EvalLite_Brain_Test_Results]]
- [[EvalLite_Brain_Pilot_Plan]]
- [[EvalLite Brain – Obsidian Master Note]]
