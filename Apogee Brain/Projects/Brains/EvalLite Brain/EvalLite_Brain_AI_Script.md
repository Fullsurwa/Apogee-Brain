---
type: subnode
parent: EvalLite Brain
---
#EvalLite

# EvalLite Brain – AI Script
EvalLite automates analytical reasoning for social impact and ROI scoring.

## Core Functions
- Interpret SmartMart operational data streams.
- Apply predictive models to forecast outcomes.
- Generate adaptive recommendations for scaling pilots.

## Integration
- Links to [[EvalLite_Brain_Test_Results]] for validation.
- Feeds into [[EvalLite_Brain_Pilot_Plan]] for execution.

## Reference Implementation
- Runnable starter script: [[EvalLite_Brain]]

---

## HOW it works (derived from Master Note modules)

### Predictive Impact Engine
- **KPI forecasting** — project whether targets will be met before completion.
- **Outcome prediction** + **early-warning alerts** when trajectory falls short (e.g. "Target Achievement Probability: 73%").
- **Trend analysis** and **resource-optimization recommendations**.
- Built on **Pandas + Scikit-Learn + Prophet** (Master Note Technology Stack), served via **FastAPI**.

### AI Recommendations Layer (the differentiator)
- Goes beyond reporting — **recommends actions**, e.g. rebalancing spend (Radio 60→40%, WhatsApp 20→35%, Community 20→25%) with a predicted outcome (cost per beneficiary −28%, reach +15%, uptake +22%).
- Recommendations are validated against the **≥ 85% forecast-accuracy** target in [[EvalLite_Brain_Test_Results]].

### Inputs & Outputs
- Consumes normalized metrics from [[EvalLite_Brain_Data_Model]] (fed by [[EvalLite_Brain_Connectors]]).
- Produces ROI, Predictive Impact scores, and **SII** outputs (Social Impact Index, Cost Per Outcome, Impact Efficiency Score, Donor Accountability Score).

## Related
- [[EvalLite_Brain_Data_Model]]
- [[EvalLite_Brain_Connectors]]
- [[EvalLite_Brain_Test_Results]]
- [[EvalLite Brain – Obsidian Master Note]]
