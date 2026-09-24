# 🧠 Apogee Project State & Error Audit Log
> **Generated:** 2026-08-27  
> **Entity:** Apogee SKOPE LLP  

---

## 📍 1. Current Project Status & Architecture

### A. Core Platform: SmartMart Brain
* **Domain:** AI-driven indoor spatial intelligence platform for supermarkets and warehouses.
* **Technology Stack:** Bluetooth 5.1 Angle of Arrival (AoA) phase-shift triangulation tracking.
* **Commercial Status:** Handover brief and rollout strategy compiled; moving toward pilot deployment.

### B. Local Automation Engine (`03_Active_Engine/Brains/core-engine/apogee_core.js`)
* **Runtime:** Node.js Express server running locally on port `3000`.
* **Features Integrated:**
  * **Dashboard:** Real-time telemetry web UI (`http://localhost:3000`) visualizing command history and activity charts.
  * **Google Calendar Sync:** Automated iCal parsing pulling daily events into `06_Daily_Rhythms/Calendar.md`.
  * **Exercise & Health Logging:** Automated step tracking, calorie calculation, and logging into `06_Daily_Rhythms/Exercise.md`.
  * **Voice/Command Pipeline:** Intent classification pipeline designed to route commands via the Anthropic Claude API.
  * **Windows Speech Integration:** Local text-to-speech output using PowerShell `System.Speech.Synthesis`.

---

## ❌ 2. Summary of Errors & Technical Friction to Correct

### Error 1: PowerShell Syntax & Escaping Collisions (Parser Errors)
* **What Happened:** Attempting to inject multi-line JavaScript code containing template literals, backticks (`` ` ``), and ES6 syntax through PowerShell string wrappers (`Set-Content` and double-quoted heredocs).
* **Root Cause:** PowerShell attempted to interpret backticks and variable symbols (`$`) as shell commands or variables, resulting in pervasive parser errors (`Unexpected token`, `Missing statement block`, `ParentContainsErrorRecordException`).
* **Resolution:** Abandon all shell-injected code generation. JavaScript must be maintained strictly as native standalone `.js` files edited in an IDE or text editor.

### Error 2: Anthropic API Authentication Failure (`401 Unauthorized`)
* **What Happened:** When the local engine successfully booted and sent a test prompt to the Claude API, Anthropic rejected the credential with: `{"type":"error","error":{"type":"authentication_error","message":"API key is invalid."}}`.
* **Root Cause:** The provided API key string was either expired, malformed during copy-pasting, or lacked valid billing/workspace association.
* **Resolution:** Provide a valid API key through the `ANTHROPIC_API_KEY` environment variable; never place it in engine source.

### Error 3: The Chat Amnesia & Shortcut Trap
* **What Happened:** Stateless chat sessions caused the assistant to repeatedly fall back to generating brittle code blocks instead of establishing persistent file-based workflows.
* **Resolution:** Anchor all project rules, states, and recovery protocols inside vault markdown files (`00_System/`) so that workspace context remains persistent across sessions.
---
