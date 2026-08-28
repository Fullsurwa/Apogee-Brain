#EvalLite

# EvalLite Brain – Data Model

## Inputs
- Outreach Reach (number of people engaged)
- Cost per Beneficiary (total spend ÷ beneficiaries)
- Conversion to Action (percentage of engaged who act)
- Retention Rate (percentage who stay engaged over time)

## Outputs
- ROI (impact ÷ cost)
- Predictive Social Impact Score (forecasted outreach productivity per dollar)
- Engagement Efficiency (actions ÷ reach)

## Data Sources
- Google Sheets (campaign budgets, outreach counts)
- WhatsApp/Twilio (message delivery + response rates)
- CSV uploads (manual NGO/SME records)

## Notes
- All metrics must be lightweight and easy to collect.
- Compliance guardrails: GDPR/EU donor reporting standards.

---

## Full Metrics Framework (aligned to Master Note)
**Financial:** ROI %, Cost-Benefit Ratio (CBR), Revenue Growth, CAC, LTV, Profit Margin.
**NGO:** Cost per Beneficiary, Cost per Outcome, Beneficiary Reach, Conversion to Action, Retention Rate, Program Completion Rate, Indicator Achievement Rate.
**Operational:** Employee Productivity Index, Program Efficiency Score, Budget Utilization Rate, Forecast Accuracy.
**Sustainability:** Sustainability Index, ESG Alignment Score, SDG Contribution Score.

## SII Outputs (Social Impact Intelligence — renamed from SIS)
- Social Impact Index
- Cost Per Outcome
- Impact Efficiency Score
- Donor Accountability Score

## Storage & Quality
- Canonical store: **PostgreSQL** (per Master Note Technology Stack).
- **Data Quality Scoring** on ingestion (nulls, ranges, duplicates) — flags routed to EvalLite_Brain_Test_Results; poor data is the key accuracy risk.
- Inputs are populated automatically by EvalLite_Brain_Connectors (phased: Sheets/Excel/CSV → WhatsApp/M-Pesa/Kobo/SurveyCTO → Salesforce/Power BI/Meta Ads/GA).
