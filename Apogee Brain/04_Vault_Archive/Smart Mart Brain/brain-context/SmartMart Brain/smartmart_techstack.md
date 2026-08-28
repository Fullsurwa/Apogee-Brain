---
tags:
  - smartmart
  - technology-stack
  - indoor-positioning
  - enterprise-architecture
  - bluetooth-aoa
created: 2026-06-17
status: Component Documentation — derived from Start Here MOC
market: Kenya / East Africa Retail
---

# SmartMart Brain — Tech Stack

> Component note for SmartMart Brain - Start Here.
> The technology layer beneath the platform — **Bluetooth 5.1 Angle of Arrival (AoA)** positioning plus an AI layer — delivering **10–30 cm** shelf-level accuracy with **no cameras, no facial recognition, no personal data**.

---

## 1. Purpose

This note documents the **technology stack** of SmartMart Brain: the positioning method, why it beats the legacy alternative, the AI that turns raw angles into reliable positions, and the hardware architecture that runs it. It expands 2–3 of SmartMart Brain - Bluetooth AoA Strategy into a standalone reference, and underpins smartmart_workflow, smartmart_analytics, and smartmart_risk.

Core proof point from the master proposal: **direction, not strength** — AoA measures signal *angle*, so it holds 10–30 cm where RSSI degrades to 5–10 m.

---

## 2. Positioning Layer — Bluetooth 5.1 AoA

The positioning layer is built on **Bluetooth 5.1 Angle of Arrival (AoA)** rather than legacy signal-strength methods. This is the core decision that delivers shelf-level accuracy without blanketing the ceiling in hardware.

### Why not RSSI?

**RSSI (Received Signal Strength Indicator)** estimates distance from signal strength. It has two fatal weaknesses on a retail floor:

- **Distance, not direction.** Turning distances into a position requires many anchors all hearing the same tag (trilateration) — meaning **hundreds of densely-spaced ceiling sensors** per store.
- **Signal strength is wildly unreliable indoors.** Dense metal shelving, refrigeration units, and moving crowds absorb and reflect 2.4 GHz signals, breaking the "strength → distance" relationship. Real-world RSSI accuracy is typically only **5–10 m** — useless for knowing the aisle, let alone the shelf.

### How AoA works instead

AoA flips the question from *"how far?"* to *"in which direction?"*

1. **Fixed antenna locators** are mounted at known positions on **walls and pillars** — not scattered across the ceiling. Each contains a **multi-element antenna array**.
2. When a Bluetooth tag transmits a **direction-finding packet**, the wavefront reaches each antenna element at a slightly different time — a measurable **phase shift**.
3. From that phase difference and the known antenna geometry, the locator computes the precise **arrival angle (azimuth + elevation)**.
4. With **two or more locators** each reporting a bearing, the system intersects them (**triangulation**) into exact **X,Y coordinates**.

### The accuracy payoff

Because position is derived from *geometry* rather than *signal strength*, AoA achieves **10–30 cm accuracy** — precise enough to identify the specific shelf section a shopper dwells at. It is **largely unaffected by metal shelving or crowds** (a wavefront's *direction* survives attenuation far better than its *amplitude*), and needs **fewer devices** — a handful of wall/pillar locators replaces hundreds of ceiling sensors.

---

## 3. AI Layer — From Raw Angles to Reliable Positions

- **Signal-noise calibration** — ML models learn each store's RF fingerprint and self-calibrate against ground-truth reference tags.
- **Multipath & overlap resolution** — models discriminate the true line-of-sight bearing from reflected "ghost" signals, and resolve many tags transmitting at once.
- **Sensor fusion & smoothing** — Kalman-style motion models fuse multi-locator angles into smooth, physically plausible tracks.
- **Continuous improvement** — every confirmed position (checkout, known dock) becomes a training signal, so accuracy improves over time **without re-surveying** the building.

---

## 4. Hardware Architecture

```
        [ Wall Locator ]          [ Pillar Locator ]
              \                        /
               \   angle θ1     angle θ2
                \                    /
                 \                  /
                  >---- SHOPPER ----<      <- X,Y resolved by triangulation
                  (color-coded BLE pin)
                         |
                         v
        ┌──────────────────────────────────┐
        │   Edge Gateway (on-site compute)  │   <- noise calibration, multipath filtering
        └──────────────────────────────────┘
                         |
                         v
        ┌──────────────────────────────────┐
        │   SmartMart Brain (AI Cloud/Edge) │   <- clustering, forecasting, dashboards
        └──────────────────────────────────┘
```

| Layer    | Component                                                     | Role                                                         |
| -------- | ------------------------------------------------------------- | ------------------------------------------------------------ |
| Tags     | Color-coded active BLE beacons (pins / embedded trolley tags) | Transmit direction-finding packets; anonymous by segment     |
| Locators | Wall + pillar multi-element antenna arrays                    | Measure arrival angle (azimuth + elevation)                  |
| Edge     | On-site gateway                                               | Noise calibration, multipath filtering, sensor fusion        |
| Brain    | AI cloud/edge platform                                        | Clustering, segmentation, forecasting, dashboards            |
| Risk     | Low-frequency EAS exit gates                                  | Polite-chime backstop for stray beacons (see smartmart_risk) |

---

## 5. AoA vs RSSI — At a Glance

| Capability | RSSI (Legacy) | **SmartMart AoA** |
|---|---|---|
| What's measured | Signal strength | Signal *direction* (phase) |
| Hardware footprint | 100s of ceiling sensors | Handful of wall/pillar locators |
| Typical accuracy | 5–10 m | **10–30 cm** |
| Metal shelving / crowds | Severely degraded | Largely robust |
| Privacy (camera/face) | N/A | **None — zero video, zero facial recognition** |
| Improves over time | No | **Yes — AI-calibrated** |
| Install & maintenance cost | High | Low |

---

## 6. Why This Stack Fits the Kenyan Market

- **Low capital footprint** — a handful of wall/pillar locators (not hundreds of ceiling sensors) suits leaner new-build budgets and fast multi-branch rollout.
- **Privacy by design** — no cameras, no facial recognition, no personal data; aligns cleanly with Kenya's **Data Protection Act (2019)**.
- **Scalable & branch-replicable** — the calibrated AI model and dashboard standard deploys consistently across every new store as the chain expands.

---


