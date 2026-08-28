---
tags:
  - smartmart
  - analytics
  - forecasting
  - retail-analytics
  - merchandising
created: 2026-06-17
status: Component Documentation — derived from Start Here MOC
market: Kenya / East Africa Retail
---

# SmartMart Brain — Analytics

> Component note for SmartMart Brain - Start Here.
> How the spatial data layer becomes operational intelligence for **merchandising** and **procurement** — the "act on it" and "plan ahead" outcomes of the master proposal.

---

## 1. Purpose

This note documents the **analytics and forecasting layer** of SmartMart Brain. It consumes the resolved, anonymous tracks produced by smartmart_workflow and turns them into decisions: where to place hero products, how to optimize shelves, which SKUs face friction, and when to reorder. It is the business-value counterpart to the technical positioning described in SmartMart Brain - Bluetooth AoA Strategy and smartmart_techstack.

From the master proof points: this is where **"direction, not strength"** pays off — shelf-level (10–30 cm) data is precise enough for planogram and procurement decisions, not just "which aisle."

---

## 2. What the Analytics Uncover

| Insight                   | What it answers                                          | Merchandising action                                                    |
| ------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| **High-traffic hotspots** | Which zones get the most foot traffic, by segment        | Place hero products and premium-vendor stock; price premium positioning |
| **Shelf optimization**    | Value of eye-level vs lower shelf-tiles (dwell + reach)  | Drive planogram decisions with real evidence                            |
| **Friction flags**        | Where shoppers pick up and put back, or linger and leave | Surface likely pricing/packaging friction on specific SKUs              |
| **Inventory forecasting** | Predicted reorder timing and volume                      | Feed procurement with forward-looking demand models                     |

---

## 3. The AI Engines

- **AI heatmaps** — render live and historical foot-traffic density across the floor plan, **segmented by demographic** (Men / Women / Families).
- **Time-series forecasting** — project demand by **SKU, hour, day, and season**, driving **predictive inventory alerts before stockouts occur**.
- **NLP feedback correlation** — tie customer reviews, complaints, and survey text to specific products and floor zones — correlating *what people say* with *where they behaved*.
- **Real-time dashboards** — a single operational pane for the store manager: hotspots, conversion-by-zone, friction alerts, and procurement warnings.

---

## 4. From Data to Decision

```
spatial tracks (smartmart_workflow)
        │
        ├─► heatmaps ───────────► hero-product & layout placement
        ├─► dwell/reach analysis ─► planogram / shelf-tier optimization
        ├─► pick-up/put-back ─────► SKU pricing & packaging friction flags
        └─► time-series models ───► predictive reorder alerts (procurement)
```

Each output is **demographic-segmented**, so a recommendation can be specific — e.g. "the Families segment dwells at the 3rd snack bay but converts low; test eye-level repositioning."

---

## 5. Dashboard Outputs (Store Manager View)

- **Hotspot map** — live + historical density, filterable by segment and time window.
- **Zone conversion** — dwell-to-purchase signals per zone.
- **Friction queue** — ranked SKUs showing pick-up/put-back or linger-and-leave behavior.
- **Procurement warnings** — forward reorder alerts by SKU with predicted timing and volume.

---

## 6. Pilot Analytics Targets

Validated during the **single-store pilot** (SmartMart Brain - Single-Store Pilot Proposal):

| Metric                  | Target                       | How measured                                     |
| ----------------------- | ---------------------------- | ------------------------------------------------ |
| **Actionable insights** | ≥ 5 distinct recommendations | Hotspot, shelf, and friction findings delivered  |
| **Forecast validation** | Within agreed tolerance      | Forecast vs actual store sales for selected SKUs |
| **Coverage**            | ≥ 95% of sales floor         | Heatmap coverage map                             |

Two review sessions are scheduled — a **mid-pilot** check and an **end-of-pilot readout** with ROI analysis and a rollout recommendation.

---

## 7. Why It Matters in the Kenyan Market

- **Data-driven merchandising from day one** — new entrants compete with established chains using real evidence, not guesswork.
- **Smarter procurement** — predictive forecasting cuts both **stockouts and spoilage/overstock**, protecting margin in a price-competitive market.
- **Scalable** — the calibrated model and dashboard standard replicate consistently across every new branch as the chain expands.

---

