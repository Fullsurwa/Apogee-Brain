---
tags:
  - evalite
  - apogeeskope
  - script
  - reference
created: 2026-06-17
status: Sub-node — runnable starter script
---

# EvalLite Brain – Runnable Starter Script

> The minimal, **actually runnable** reference implementation of the EvalLite metrics. Source of truth: `evalite_brain.py` in this folder. Use it for demos before cloud deployment.

Parent: [[EvalLite Brain – Obsidian Master Note]] · Logic described in EvalLite_Brain_AI_Script · Metrics defined in EvalLite_Brain_Data_Model

---

## What it computes
From four lightweight inputs, it derives the core EvalLite outputs:
- **Cost per Beneficiary** = cost ÷ outreach reach
- **Conversion Rate** = actions ÷ reach
- **Retention Rate** = retained ÷ actions
- **ROI** = actions ÷ cost
- **Predictive Social Impact Score** = (conversion × retention) ÷ cost per beneficiary

---

## Script
```python
# EvalLite Brain - Starter Script
# Lightweight ROI + Impact Score calculator

# Example input data (replace with NGO/SME dataset)
outreach_reach = 1000        # number of people engaged
cost = 5000                  # total campaign spend
actions = 120                # number of people who took action
retained = 80                # number of people retained

# Core calculations
cost_per_beneficiary = cost / outreach_reach
conversion_rate = actions / outreach_reach
retention_rate = retained / actions

roi = actions / cost
predictive_social_impact_score = (conversion_rate * retention_rate) / cost_per_beneficiary

# Print results
print("Cost per Beneficiary:", round(cost_per_beneficiary, 2))
print("Conversion Rate:", round(conversion_rate, 2))
print("Retention Rate:", round(retention_rate, 2))
print("ROI:", round(roi, 2))
print("Predictive Social Impact Score:", round(predictive_social_impact_score, 4))
```

## Run it
```bash
python evalite_brain.py
```

---

## How it maps to the product
- **Inputs** → the connectors in EvalLite_Brain_Connectors populate these fields automatically.
- **Outputs** → validated against real outcomes in EvalLite_Brain_Test_Results.
- **Next step** → replace the hard-coded example inputs with a data stream and wrap in `run_eval_pilot()` as the model matures.

---
