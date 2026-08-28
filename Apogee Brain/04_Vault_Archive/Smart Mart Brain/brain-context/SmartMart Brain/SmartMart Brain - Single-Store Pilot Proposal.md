---
tags:
  - smartmart
  - sales
  - pilot
  - proposal
  - kenya
created: 2026-06-13
status: Draft Proposal — placeholders to confirm
audience: Prospective supermarket client — single store pilot
---

# SmartMart Brain — Single-Store Pilot Proposal

**Prepared by:** Apogee SKOPE LLP

**Prepared for:** [Client / Chain Name]

**Date:** 2026-07-10

**Validity:** 30 days from issue

## 🤖 AI SPECS DISCOVERY PROMPT (For Custom Variations)

> **Note: How to use this node with an AI Agent**
> 
> Copy the text block below and paste it into a chat session. The AI will ask you for specific client metrics and automatically format a finished proposal for your meeting.

Plaintext

```
"Act as my elite B2B technical sales engineer. I am preparing a tailored client proposal based on my SmartMart Brain - Single-Store Pilot Proposal blueprint. Please interview me by asking five crisp, targeted questions about my upcoming client's space (e.g., store name, estimated square meters, number of tracking pins/trolleys required, currency/pricing preferences, and timeline constraints). Once I give you the answers, compile them into a fully populated, highly professional Markdown proposal using the structure of my template node."
```

## 1. Pilot Objective

Deploy the SmartMart Brain platform within a single nominated retail or warehouse facility to demonstrate, via real-time spatial telemetry and voice-directed commands, that the platform:

- **Captures the "5-Minute Checkout Cliff":** Monitors checkout queue wait times to proactively alert managers _before_ shoppers panic-abandon their carts, recovering up to 10% in lost top-line revenue.
    
- **Proves Capital Efficiency via Choke-Point Zoning:** Focuses hyper-precise tracking (10–30 cm accuracy) strictly where money changes hands, while using low-cost proximity tracking in wider corridors, reducing hardware deployment costs by up to 70%.
    
- **Employs Algorithmic Jitter Filtering:** Implements edge-computed Kalman filtering to eliminate signal bounces from metal shelves and crowds, presenting smooth, actionable tracking vectors on the dashboard.
    
- **Provides Zero-Downtime System Integrity:** Proves that the Local Keyword Fallback Strategy keeps the telemetry dashboard and local database operational on the local edge computer gateway if the cloud network experiences downtime.
    
- **Guarantees Regulatory Alignment:** Operates with zero cameras, zero biometric risks, and full compliance with Kenya’s Data Protection Act (2019) by tracking anonymous trolley assets rather than customer faces.
    

## 2. Project Scope

### 📥 In-Scope

- **Choke-Point & RF Topological Survey:** Custom mapping of the store floorplan to establish **Choke Points** (high-precision locator matrices over tills and high-value displays) and **Proximity Zones** (lower-density sensors for general aisles).
    
- **Core Hardware Deployment:** Supply and installation of wall/pillar-mounted Bluetooth 5.1 AoA Locators and an On-site Edge Computer Gateway.
    
- **Ecosystem Software Activation:** Provisioning of the local core engine (`apogee_core.js`) configured to run local Kalman filtering and serve the live telemetry UI on `http://localhost:3000`.
    
- **Dynamic 10% Trolley Sampling Kit:** Provisioning of active, color-coded tracking tags (Men 🔵 / Women 🔴 / Families 🟢) to be deployed on a **10% to 15% randomized sample** of the store's shopping trolley fleet to build a statistically bulletproof traffic baseline over 90 days.
    
- **Automated Load-Balancing & Checkout Webhooks:** Configuring real-time threshold alerts (via Make.com webhooks) to notify staff of queue dwell-time spikes or entrance trolley shortages.
    
- **Local Infrastructure Database:** Configuration of automated, plain-text event logging directly into a secure, on-site file vault repository.
    
- **Executive Review Readouts:** Two dedicated performance review sessions (Mid-Pilot check-in + End-of-Pilot executive data readout demonstrating recovered revenue calculations).
    

### 📤 Out-of-Scope (Pilot Phase Only)

- Multi-facility central network aggregation (Available in full rollout phase).
    
- Deep production POS/ERP direct software integration.
    
- Custom UI software widget development outside the standard dashboard platform.
    

## 3. Indicative Timeline (8-Week Framework)

|**Phase**|**Weeks**|**Core Operational Activities**|
|---|---|---|
|**1. Survey & Design**|Weeks 1–2|On-site RF spectrum mapping, defining physical checkout "Choke Points", plotting locator grids, and launching the 10% trolley tag sample framework.|
|**2. Install & Calibrate**|Weeks 3–4|Mounting edge hardware, spinning up the local Node.js server, calibrating Kalman filter algorithms to eliminate signal jitter, and establishing floor truth points.|
|**3. Live Stream Execution**|Weeks 5–7|Voice-directed tracking dashboard go-live, real-time spatial data logging, automated queue bottleneck alert validation, and mid-pilot performance health check.|
|**4. Operational Readout**|Week 8|Technical metrics analysis, Edge Fallback stress-test audit report, recovered checkout revenue ROI evaluation, and multi-branch expansion blueprint.|

## 4. Success & Integrity Metrics

The pilot program is judged "successful" when it achieves the following verified operational benchmarks:

- **Choke-Point Positioning Accuracy:** Under 30 cm median spatial error at targeted checkout tills and promotional zones, verified via reference-tag coordinate validations.
    
- **Walkway Telemetry Coverage:** 95% or higher macro-occupancy accuracy across general aisles using simplified proximity mapping.
    
- **Jitter Mitigation:** Stable, continuous visual tracking on the local dashboard UI with zero erratic coordinate jumps, proven via real-world simulated walkthroughs during high-traffic crowd hours.
    
- **Checkout Friction Protection:** 100% success rate in triggering dynamic manager alerts when a tagged trolley's dwell time exceeds 180 seconds in the checkout queue.
    
- **Failover Fault Tolerance:** 100% processing continuity during simulated network disconnects via immediate Local Keyword Fallback Engine execution.
    
- **Privacy & Regulatory Alignment:** 100% compliance verification against a formal DPA (2019) audit checklist (Zero video captured, zero PII generated).
    
- **Core Platform Uptime:** 99.5% or higher local server uptime throughout the live collection window.
    

## 5. Commercial Structure

_Thanks to Choke-Point Zoning, hardware costs are strictly minimized by avoiding unnecessary whole-store coverage._

|**Investment Component**|**Fee Type**|**Pilot Phase Valuation**|
|---|---|---|
|**One-Time Engineering Setup** (Site Survey, Choke-Point Grid Mapping, Calibration)|Fixed Fee|[KES _________]|
|**Platform Edge Hardware Lease** (AoA Locators, Gateway PC, 10% Sample Tag Kit)|Lease/Purchase|[KES _________]|
|**Ecosystem Core Engine & Telemetry UI License**|Monthly|[Waived / Credited toward Rollout]|
|**TOTAL INITIAL PILOT INVESTMENT**|**Fixed-Scope**|**[KES _________]**|

> **💡 Risk-Reversal Incentive**
> 
> A pre-agreed percentage of the initial pilot setup fee will be credited back to the client as a contract signing bonus if a multi-facility expansion agreement is executed within [X] days following the final readout.

## 6. Client Site Prerequisites

- Nominated facility equipped with stable electrical mains and dedicated local RJ45 network connectivity at the central edge computer position.
    
- Unrestricted physical access to the facility for engineering surveys and hardware mounting during scheduled off-peak windows.
    
- Designated operations and IT points of contact assigned to coordinate with the Apogee team.
    
- Formal agreement on the primary asset/shopper tracking delivery method (Entrance-issued pin tags vs. embedded shopping trolley components).
    

## 7. Path to Enterprise Rollout

Upon successful completion of pilot criteria benchmarks, Apogee SKOPE LLP provides a clear path to scale:

1. **Phased Multi-Branch Rollout:** Rapid deployment across the client's [N] expansion branches using a standardized, pre-engineered installation framework.
    
2. **Central Intelligence Data Hub:** Aggregation of distinct facility telemetry streams into a centralized executive dashboard pane for corporate analysts.
    
3. **Closed-Loop ERP Hooks:** Advanced integration enabling real-time spatial analytics data to feed automated warehouse procurement pipelines directly.
