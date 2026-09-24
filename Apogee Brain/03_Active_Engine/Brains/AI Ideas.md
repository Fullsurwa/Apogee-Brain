---
type: hub
main_node: true
links:
	- 04_Vault_Archive/Smart Mart Brain/brain-context/SmartMart Brain/SmartMart Brain - Start Here
	- 04_Vault_Archive/EvalLite Brain/brain-context/EvalLite Brain – Obsidian Master Note
---
## Map of Content Entry Point
# #AIIdeasHub

AI Ideas - Rough work
---

---


## 1. Automate customer replies on WhatsApp
Most Kenyan SMEs run their sales and support through WhatsApp. An AI chatbot (e.g. via the WhatsApp Business API with a tool like Turn.io, or a custom build) can instantly answer the repetitive questions â€” prices, M-Pesa till numbers, opening hours, delivery areas, stock availability â€” in English or Swahili, 24/7. This frees the owner from replying to the same messages all day and means no late-night customer goes unanswered.

## 2. Generate marketing content and product posts
Instead of spending hours writing captions, an SME can use AI (ChatGPT, Claude, or Canva's built-in AI) to draft Facebook/Instagram/TikTok posts, product descriptions, and promo flyers in seconds â€” tuned to local tone and pricing in KES. A boutique, salon, or food vendor can produce a week of social content in one sitting, keeping their pages active without hiring a marketer.

## 3. Automate bookkeeping and M-Pesa reconciliation
Tracking daily sales and matching them against M-Pesa statements is tedious and error-prone. AI-powered tools (or a simple spreadsheet with AI assistance) can read M-Pesa SMS/statements, categorise income and expenses, flag mismatches, and produce simple profit summaries. This saves hours of manual entry each week and gives the owner a clear, real-time picture of cash flow for better decisions and easier tax filing.

---

## AI Ideas - Conceptual builds so far
- [[04_Vault_Archive/Smart Mart Brain/brain-context/SmartMart Brain/SmartMart Brain - Start Here|SmartMart Brain]] — privacy-first, AI-driven indoor shopper intelligence for supermarket chains.
- [[04_Vault_Archive/EvalLite Brain/brain-context/EvalLite Brain – Obsidian Master Note|EvalLite Brain]] — AI-powered monitoring, evaluation, and learning platform.



---

# PARKED AI / APOGEE RESEARCH IDEAS

These ideas are parked for future reference. Do not implement automatically. Review deliberately when activated, with **1 October 2026** as the planned Apogee review point.

## START PLAN — EASIEST PATH FIRST

The sequence below deliberately starts with the lowest-risk activity and moves progressively toward architecture study and potential building.

### 1. START HERE — Learn: UN/UNESCO AI Governance Course
**Idea #9 — AI Governance / Responsible AI**

- Type: Learning
- Difficulty: Low
- Coding required: No
- Suggested first session: 60–90 minutes
- Output: concise notes + practical governance checklist
- Focus: AI ethics, privacy, data governance, responsible AI
- Reason to start here: immediate learning with no code changes or architecture risk.

### 2. NEXT — Development Workflow: Matt Pocock Skills
**Idea #1 — Development Intelligence / Builder Agent Workflow**

- Type: Development workflow learning
- Difficulty: Low–Medium
- Focus: `grill-me`, `grill-with-docs`, `tdd`, `diagnosing-bugs`, `triage`
- Goal: determine which skills improve Builder Agent development quality.
- Output: identify useful skills and test them against a real Apogee development task.
- These are workflow tools, not Apogee runtime dependencies.

### 3. THEN — Selective Technical Learning: CodeCrafters
**Idea #3 — Underlying Systems**

- Type: Technical learning
- Difficulty: Medium
- Choose one relevant build only when it addresses a real Apogee knowledge gap.
- Possible areas: RAG, AI systems, databases, networking, web servers, search, distributed systems.
- Rule: do not rebuild functioning Apogee components merely for learning.

### 4. THEN — Study the Natural-Language → Action Pattern
**Ideas #4–#7**

Treat these four ideas as one architecture-study cluster rather than four separate products.

Common pattern:

**Unstructured input → intent/entity extraction → identify missing information → clarification → structured state → controlled capability → validation → action → confirmation/handoff**

Study:
- ambiguity
- incomplete information
- multi-intent requests
- structured entity extraction
- controlled actions
- human escalation
- evidence behind classifications
- truthful confirmation

This should inform Apogee's intent/capability architecture, including the known multi-action limitation.

### 5. LATER — Build Business Infrastructure
**Idea #8 — Brand Identity & Digital Infrastructure Sprint**

When activated, start with the easiest asset and execute sequentially:

1. Brand mini-kit
2. Capability / pitch deck
3. Digital business card / landing page
4. Email signature
5. Custom domain email
6. Website
7. Kenyan B2B/SLA templates

### 6. LATER — Research Future Visual Interface
**Idea #2 — Barehands**

- Type: Future interface research
- Difficulty: High
- Possible direction: visualising Apogee, projects, dashboards and selected vault information.
- Do not make it a dependency of the core Apogee Brain.
- First establish whether a visual interface solves a real user problem.

---

# PARKED IDEAS

## #1 — Matt Pocock Skills
**Category:** Development intelligence / Builder Agent workflow  
**Status:** PARKED  
**Reference:** https://github.com/mattpocock/skills

Useful skills include `grill-me`, `grill-with-docs`, `tdd`, `diagnosing-bugs`, and `triage`.

Potential value: improve planning, testing, debugging and review of Apogee development work.

Decision: evaluate as Builder Agent/development workflow tooling rather than Apogee runtime functionality.

## #2 — Barehands
**Category:** Future visual interface  
**Status:** PARKED  
**Reference:** https://github.com/jaredrhod/barehands

Concept: webcam + hand tracking + browser-based visual interaction for AI.

Potential Apogee direction:
- visual representation of Apogee
- "show me" interactions
- visualising projects, dashboards or vault information

Risks include webcam/privacy considerations, additional infrastructure, browser/MediaPipe/Three.js complexity, and AGPL-3.0 licensing implications for commercial use.

Decision: future research, not a current build.

## #3 — CodeCrafters Build-Your-Own-X
**Category:** Technical learning  
**Status:** PARKED  
**Reference:** https://github.com/codecrafters-io/build-your-own-x

Concept: curated "learn by rebuilding it yourself" technical projects.

Potential value: deeper understanding of systems underneath Apogee without automatically adding dependencies.

Decision: use selectively when a concrete Apogee knowledge gap exists.

## #4 — DM-to-Booking Flow
**Category:** Natural-language → structured action  
**Status:** PARKED

Pattern:
DM → Auto-Reply → Client Saved → Sorted → Booked

Potential value:
Demonstrates unstructured input becoming structured customer state and then a controlled booking capability.

Study: incomplete information, availability, identity, double bookings, cancellations, human handoff and truthful confirmation.

Decision: study the architecture pattern, not the business-specific implementation.

## #5 — Lead Qualification & Sorter
**Category:** Natural-language classification / routing  
**Status:** PARKED

Pattern:
DM → 3 Questions → AI Filter → Hot/Warm/Cold

Potential value:
Demonstrates clarification, structured state, explicit classification rules and routing.

Caution: classifications should retain supporting evidence rather than becoming opaque AI scores.

Decision: study as an intent/state/routing pattern.

## #6 — Reservation & Inquiry Catcher
**Category:** Intent splitting / transactional routing  
**Status:** PARKED

Pattern:
DM → Menu / Booking → AI Split → Manager Alert → Guest List

Potential value:
Information-vs-transaction routing, human escalation, guest-state management and controlled booking actions.

Decision: study as a controlled capability-routing pattern.

## #7 — Part Enquiry Parser
**Category:** Natural-language → structured data  
**Status:** PARKED

Pattern:
DM → Vehicle Capture → AI Parse → Brand Filter → WhatsApp → Sale

Useful structured state:
- vehicle make
- model
- year
- part category
- part position
- brand preference

Potential value: strong example of converting messy language into validated capability inputs.

Rule: AI extraction produces candidate data; validate it before consequential external actions.

Decision: study as a reference pattern for Apogee's intent/entity/clarification architecture.

## #8 — Brand Identity & Digital Infrastructure Sprint
**Category:** Business infrastructure / brand assets  
**Status:** PARKED

Objective: create durable company brand and digital infrastructure that can live in the second brain and support future business execution.

Core gaps:
1. Brand Guidelines mini-kit
2. Website
3. Custom domain email
4. Digital pitch deck / capability statement
5. Digital business card
6. Email signature
7. Kenyan B2B/SLA templates

Decision: execute sequentially only when explicitly activated.

## #9 — UN/UNESCO AI Governance Course
**Category:** AI governance / professional development  
**Status:** PARKED  
**Reference:** https://www.coursera.org/learn/global-mooc-on-the-ethics-of-ai

Potential value:
- responsible AI vocabulary
- privacy/data governance awareness
- governance principles
- future Apogee architecture and business positioning

Decision: parked as a learning activity and designated as the easiest starting point.

---

# OCTOBER 1 REVIEW

Review all parked ideas together, plus the known Apogee architecture and behaviour gaps.

## Known Build / Architecture Issues

- Multi-action voice requests currently execute only the first matching capability.
- Calendar natural-language date parsing needs review.
- Calendar event-field extraction needs review: title, description, location, date and time.
- Intent → task → capability routing is currently partly implemented inline.
- Customer Validation Skill is being used as the first reference Skill implementation.
- Evaluate the researched development-agent skills and workflow patterns.
- Preserve working Voice/Whisper, barge-in, Calendar, safety boundaries and vault structure.

## NEW: Persistent Life / Project State Management

Apogee currently reads important state from Obsidian, but natural-language voice interaction does not yet provide a general controlled mechanism for maintaining that state.

The October 1 review must determine how Apogee can move from:

**"Apogee can read my world"**

toward:

**"Apogee can safely maintain my persistent world state."**

The intended pattern is:

**Voice → Intent → Domain → Permitted Operation → Authoritative State → Validate → Write → Verify → Confirm**

The goal is that users can eventually say things such as:

- "Change my primary objective."
- "Add this to my active priorities."
- "Update the perfume validation status."
- "Mark this project as my current focus."
- "What are my current priorities?"
- "What has changed?"

without requiring PowerShell or manual Obsidian editing.

### Review Requirements

Determine:

- Which vault files are authoritative for each domain.
- Which write operations Apogee is permitted to perform.
- How natural-language requests map to those operations.
- What information must be retrieved before changing state.
- When clarification is required.
- What validation must occur before writing.
- How Apogee verifies that the write actually happened.
- How truthful confirmation is generated.
- How Life CEO and project dashboards should be updated.
- Which dashboard information should instead be derived from underlying authoritative state.

Initial domains to consider:

- Life / CEO state
- Exercise
- Bible
- Philosophy / Notes
- Calendar
- Projects
- Customer Validation

Do not create unrestricted general-purpose Markdown editing.

## October 1 Questions

- Which ideas improve Apogee's architecture?
- Which are learning activities only?
- Which should become Builder Agent skills?
- Which patterns should influence the intent/capability layer?
- Which ideas justify an actual build?
- Which should remain parked?
- What can be learned without unnecessary dependencies?
- What should be added to the Apogee development workflow?
- How should Apogee safely maintain persistent Life/Project state through natural language?

## Core Principle

> Do not make Apogee smarter by throwing more AI at it. Make it better at turning ambiguous human intent into controlled, verifiable action.

**Understand → Structure → Clarify → Validate → Act → Verify → Remember**
---
