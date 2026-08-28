---
tags:
  - smartmart
  - workflow
  - operations
  - indoor-positioning
  - retail-analytics
created: 2026-06-17
status: Component Documentation — derived from Start Here MOC
market: Kenya / East Africa Retail
---

# SmartMart Brain — Workflow

> Component note for SmartMart Brain - Start Here.
> How an anonymous shopper journey becomes structured spatial data — from the entrance pin to a predicted next stop — with **no cameras, no facial recognition, no personal data**.

---

## 1. Purpose

This note documents the end-to-end **operational workflow** of SmartMart Brain: the physical and data path that turns a single shopper visit into the spatial layer that powers smartmart_analytics. It is the "what happens, step by step" companion to the technical architecture in SmartMart Brain - Bluetooth AoA Strategy and the technology layer in smartmart_techstack.

The core principle from the master proposal: **the cart is the tracker** — adoption and the "Forgetfulness Factor" are designed out from the start (see smartmart_risk).

---

## 2. The Pin / Trolley Workflow

At the entrance, each shopper is issued an **anonymous, color-coded active Bluetooth LE beacon** — either a pocket pin or, preferably, a tag embedded in a demographic-segregated basket/trolley. The beacon maps to one of **three demographic categories** only:

| Beacon color | Segment  | Issued as                                                   |
| ------------ | -------- | ----------------------------------------------------------- |
| 🔵 Blue      | Men      | Pin or men's-segment trolley                                |
| 🔴 Red       | Women    | Pin or women's-segment trolley                              |
| 🟢 Green     | Families | Pin or family-segment trolley (couples, parents + children) |

> The system **never identifies an individual**. It only sees an anonymous color category moving through space — the foundation of Data Protection Act (2019) compliance.

---

## 3. End-to-End Data Flow

```
[Entrance] pick up color beacon (pin / embedded trolley tag)
     │
     ▼
[Sales floor] wall + pillar AoA locators passively measure arrival angle
     │   (azimuth + elevation from multi-element antenna phase shift)
     ▼
[Triangulation] two+ locators intersect bearings → exact X,Y coordinates (10–30 cm)
     │
     ▼
[Edge Gateway] noise calibration, multipath filtering, sensor fusion / smoothing
     │
     ▼
[SmartMart Brain] path clustering, segmentation, next-stop prediction → dashboards
     │
     ▼
[Exit] beacon returned (trolley stays) / EAS chime backstop  → see smartmart_risk
```

### Step-by-step

1. **Issue** — shopper collects a color-coded beacon at the entrance.
2. **Passive capture** — as the shopper moves, fixed wall/pillar locators read each direction-finding packet and compute an arrival angle. No action is required from the shopper.
3. **Position resolution** — two or more locators intersect their bearings (triangulation) into precise X,Y coordinates at **10–30 cm** accuracy.
4. **Edge processing** — the on-site gateway calibrates against the store's RF fingerprint, filters reflected "ghost" signals, and fuses multi-locator angles into a smooth track.
5. **Intelligence** — the Brain clusters the track, segments it by demographic, and predicts the next likely aisle.
6. **Return** — the beacon is returned at checkout (or stays with the trolley); the EAS chime is a low-cost backstop for stray pins.

---

## 4. The AI Behavior Layer

Once tracks are resolved, three behavioral engines run continuously:

- **Path clustering** — groups thousands of anonymous journeys into common route archetypes (e.g. *entrance → produce → dairy → checkout*).
- **Behavioral segmentation** — contrasts how Men / Women / Families traverse the store, where they dwell, and where they backtrack.
- **Next-stop prediction** — given a shopper's path so far, predicts the likely next aisle, enabling **dynamic, well-timed promotions** (e.g. a digital-shelf offer fired as a Family segment approaches the snacks aisle).

These outputs feed directly into smartmart_analytics.

---

## 5. Operational Roles & Touchpoints

| Stage                 | Owner                | Action                                                            |
| --------------------- | -------------------- | ----------------------------------------------------------------- |
| Beacon issue / return | Store front-of-house | Hand out and collect beacons; restock the entrance rack           |
| Floor coverage        | Apogee SKOPE install | Locator placement so ≥ 95% of the sales floor is covered          |
| Calibration           | Apogee SKOPE AI      | Reference-tag calibration to the store's RF fingerprint           |
| Daily monitoring      | Store manager        | Watch real-time dashboard; act on hotspots and friction flags     |
| Promotion firing      | Merchandising        | Trigger dynamic, location-timed offers from next-stop predictions |

---

## 6. Pilot Workflow Context

During the **single-store pilot** (SmartMart Brain - Single-Store Pilot Proposal), this workflow is validated across an 8-week sequence:

1. **Survey & Design (wk 1–2)** — locator placement plan + beacon strategy sign-off.
2. **Install & Calibrate (wk 3–4)** — mount locators/gateway, calibrate against reference tags.
3. **Live Data Collection (wk 5–7)** — workflow runs live, dashboards go live, mid-pilot review.
4. **Readout & Decision (wk 8)** — results report and rollout recommendation.

Workflow-relevant success targets: **≥ 95% floor coverage**, **≤ 30 cm median accuracy**, and **≥ 99% locator/gateway uptime** during the live weeks.

---

