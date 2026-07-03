---
tags:
  - evalite
  - apogeeskope
  - validation
  - results
created: 2026-06-17
status: Sub-node — validation & results template
---

# EvalLite Brain – Test Results

> Validation layer for the platform. Proves the Master Note's **Success Metric: Forecast Accuracy ≥ 85%** before clients and donors rely on outputs, and logs pilot results.

Parent: [[EvalLite Brain – Obsidian Master Note]] · Produced by [[EvalLite_Brain_AI_Script]] · Inputs from [[EvalLite_Brain_Data_Model]] · Data-quality flags from [[EvalLite_Brain_Connectors]]

---

## Purpose
1. Record outputs of each pilot run (forecast vs. actual) across the ROI, Predictive Impact, and SII engines.
2. Quantify accuracy against the **≥ 85% forecast-accuracy** target.
3. Gate progression Pilot → Paid subscription (Master Note: Pilot-to-Paid ≥ 50%; see [[EvalLite_Brain_Pilot_Plan]]).

---

## Validation Methodology
| Method | What it checks | Pass threshold |
|---|---|---|
| Back-test on historicals | Does the model fit past outcomes? | Forecast accuracy ≥ 85% |
| Hold-out split (80/20) | Does it generalise to unseen periods? | Accuracy ≥ 85% |
| Scenario back-cast | Were AI reallocation recommendations directionally correct? | ≥ 80% correct direction |
| Data Quality Score | Is input data clean enough to trust? | No unresolved high-severity flags |
| Drift monitor | Has accuracy degraded since last run? | Accuracy stays ≥ 85% |

---

## Metrics Validated (per Master Note framework)
- **Financial:** ROI %, Cost-Benefit Ratio, Revenue Uplift.
- **NGO:** Cost per Beneficiary, Cost per Outcome, Conversion to Action, Retention Rate.
- **SII outputs:** Social Impact Index, Cost Per Outcome, Impact Efficiency Score, Donor Accountability Score.

---

## Result Log Template
| Run ID | Date | Client | Metric | Forecast | Actual | Accuracy % | Verdict |
|---|---|---|---|---|---|---|---|
| EL-001 | YYYY-MM-DD | — | ROI % | — | — | — | Pass/Fail |
| EL-001 | YYYY-MM-DD | — | Cost per Outcome | — | — | — | Pass/Fail |
| EL-001 | YYYY-MM-DD | — | Social Impact Index | — | — | — | Pass/Fail |

---

## Illustrative Pilot Result (worked example — not live data)
**Health NGO vaccination campaign** (from Master Note AI Recommendations example):
- AI recommendation: rebalance Radio 60→40%, WhatsApp 20→35%, Community 20→25%.
- **Forecast:** cost per beneficiary −28%, reach +15%, vaccination uptake +22%.
- **Actual (illustrative):** cost per beneficiary −25%, reach +13%, uptake +20%.
- **Accuracy:** ~89% on uptake → **Pass** (≥ 85% target).

---

## Acceptance Criteria (Pilot → Paid)
- [ ] Forecast accuracy ≥ 85% across ≥ 2 reporting periods.
- [ ] ≥ 1 AI reallocation recommendation adopted and measured.
- [ ] Client confirms dashboard reflects reality ("face validity").
- [ ] No unresolved data-quality flags from [[EvalLite_Brain_Connectors]].

---

## Related
- [[EvalLite_Brain_AI_Script]]
- [[EvalLite_Brain_Data_Model]]
- [[EvalLite_Brain_Pilot_Plan]]
- [[EvalLite Brain – Obsidian Master Note]]
