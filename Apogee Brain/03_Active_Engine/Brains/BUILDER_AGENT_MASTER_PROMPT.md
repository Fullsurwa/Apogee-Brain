# APOGEE BRAIN — BUILDER AGENT MASTER PROMPT

## Mission

Continue developing Apogee Brain into a true personal second brain and Life CEO: a natural-language, voice-enabled personal intelligence system that understands what I ask, retrieves the right context, performs controlled actions, and helps me reason and make better decisions.

Apogee must not become merely a filing cabinet, chatbot, or collection of notes.

The goal is:

Experience + Knowledge + Wisdom + Goals + Current Situation → Better Reasoning → Better Decisions → Better Action

I remain the final decision maker.

Apogee acts as my chief-of-staff / strategic advisor / second brain.

---

# 1. EXISTING SYSTEM IS AUTHORITATIVE

Work from the existing Apogee Brain repository:

C:\Users\kewot\OneDrive\Desktop\Dan\Apogee SKOPE LLP\Apogee Brain

Preserve the existing architecture unless a change is clearly necessary.

Do not perform a wholesale rewrite.

Do not create competing architectures.

Do not duplicate information unnecessarily.

Respect the existing vault rules and folder structure.

Important existing areas include:

- 00_Command_Center
- 01_Apogee_Core
- 03_Active_Engine
- 04_Vault_Archive
- 06_Daily_Rhythms
- Session Logs

Existing project structure under 03_Active_Engine remains authoritative.

Do NOT introduce a second generic Projects architecture from another system.

---

# 2. CURRENT VOICE ARCHITECTURE

The current voice pipeline is already working:

Microphone → FFmpeg → Whisper.cpp → transcript → Apogee intent/pipeline → reasoning → Windows TTS

Current voice interaction:

1. Press ENTER to start listening.
2. Speak.
3. Press ENTER to stop.
4. Whisper transcribes.
5. Apogee processes the request.
6. Apogee responds through existing TTS.

Do not replace this interaction model unless there is a compelling reason.

The voice system has already been successfully tested end-to-end.

---

# 3. CORE OPERATING MODEL

The desired architecture is:

Voice / Text
↓
Natural-language intent layer
↓
Rules / permissions / safety
↓
Capability
↓
Correct knowledge area or external system
↓
Validated action
↓
Truthful confirmation

For questions:

Question
↓
Retrieve relevant context
↓
Personal knowledge + goals + projects + history + external knowledge
↓
Reasoning / synthesis
↓
Answer / recommendation

Apogee should understand natural language rather than requiring users to know file paths or internal commands.

Example:

"Update that I've read Genesis chapter 1."

The user should not need to specify the internal file path.

Apogee should identify the appropriate domain and perform the controlled update.

---

# 4. CONTROLLED WRITES

Do NOT give Apogee unrestricted arbitrary vault-editing capability.

Instead, implement controlled structured capabilities.

Examples:

- Exercise
- Bible / Reading
- Books
- Philosophy
- Calendar
- Projects
- other clearly defined domains as they become necessary

Each capability should:

1. Understand the natural-language request.
2. Identify the appropriate domain.
3. Apply the relevant rules.
4. Read existing state where necessary.
5. Make the smallest correct change.
6. Validate the result.
7. Report exactly what happened.

Generic destructive or ambiguous vault edits should remain restricted.

---

# 5. READING STRUCTURE

Use the following conceptual structure:

Reading/
    Bible/
    Philosophy/
    Books/

This is inspired by the useful parts of the Sample Brain architecture but adapted to Apogee.

Do NOT copy Sample Brain wholesale.

Do NOT add:

- Courses
- Tasks
- Journal
- generic Notes
- a new generic Projects system

Existing Apogee project architecture remains separate and authoritative.

---

# 6. BOOK KNOWLEDGE

The Books area is not merely a reading log.

A book record should allow Apogee to understand:

- title
- author
- what the book argues
- important ideas
- useful lessons
- the user's interpretation
- important passages
- implications for the user's life/business
- disagreements or uncertainties where relevant

The user may provide a summary.

However:

The user's summary is evidence, not automatically truth.

Apogee should distinguish between:

1. What the user says the book means.
2. What the author/source actually argues.
3. Independent evidence or external information.
4. Apogee's synthesis/inference.
5. What may actually apply to the user's current situation.

When appropriate, Apogee should use external research to verify or challenge the interpretation.

Do NOT browse the internet unnecessarily for every retrieval.

Use external research when:

- the user asks for it
- source meaning needs verification
- factual accuracy matters
- information may have changed
- there is a meaningful disagreement
- the distinction materially affects the advice

The purpose is to prevent Apogee from becoming an echo chamber.

---

# 7. PHILOSOPHY / WISDOM KNOWLEDGE

Philosophy should contain useful wisdom that Apogee can draw upon when helping the user reason.

This can include:

- passages from books
- sayings
- aphorisms
- philosophical ideas
- principles
- lessons from historical figures
- lessons from prominent leaders
- wisdom from ordinary people
- unattributed sayings
- user-authored principles
- experience-derived lessons

Where possible, preserve provenance.

For example:

- Source: known book
- Source: known person
- Source: historical event
- Source: user
- Source: personal experience
- Source: unattributed

Do not pretend an unattributed saying has a known author.

---

# 8. PERSONAL PRINCIPLES & EXPERIENCE

Treat these as a unified provenance category.

This includes:

- principles I personally believe
- lessons I have learned
- lessons derived from my own experiences
- rules I have developed
- observations about my behavior
- strategic lessons from projects
- personal operating principles

Apogee must distinguish these from externally sourced wisdom.

A principle I personally developed should not silently be presented as something an author or historical figure said.

---

# 9. PROVENANCE-AWARE REASONING

The conceptual knowledge layers are:

A. Source Knowledge

What an external source actually says.

Examples:

- books
- Bible
- historical figures
- leaders
- documented events
- research

B. User Interpretation

What I believe the source means.

C. Personal Principles & Experience

What I have personally concluded or learned.

D. External Evidence

Independent facts, research, and verification.

E. Apogee Synthesis

Apogee combines the above to help answer the current question.

The system should preserve these distinctions.

---

# 10. ANTI-ECHO-CHAMBER PRINCIPLE

A central objective is:

Apogee should help me think better, not merely remember what I already think.

When appropriate, Apogee should be able to say:

- Your interpretation differs from the author's argument.
- There is evidence against this assumption.
- This principle may apply here, but there is an important exception.
- Your past experience suggests X, but the current evidence suggests Y.
- There are multiple reasonable interpretations.

Do not automatically agree with the user.

Do not automatically challenge the user either.

Challenge when evidence, reasoning, or provenance warrants it.

---

# 11. LIFE CEO MODEL

Apogee should eventually reason using:

External wisdom
+
Personal experience
+
Personal principles
+
Books
+
Bible / philosophy
+
Historical lessons
+
Projects
+
Goals
+
Current circumstances
+
External evidence

to produce useful strategic advice.

The user should not have to explicitly tell Apogee which knowledge source to consult every time.

Apogee should determine what context is relevant.

Example:

If I ask:

"Should I pursue this business opportunity?"

Apogee may consider:

- my goals
- previous business lessons
- relevant project context
- principles I have saved
- lessons from books
- historical/business examples
- current market information
- risks
- evidence

Then provide a reasoned recommendation.

---

# 12. CALENDAR

Calendar must become a real Apogee capability.

The user should be able to say naturally:

"Remind me to pick up my car from the shop on 11 September at 9 AM."

Apogee should:

1. Understand the intent.
2. Parse the date/time.
3. Resolve ambiguity when necessary.
4. Apply Calendar rules.
5. Create the event through the configured Calendar capability.
6. Validate successful creation.
7. Only then tell the user it was created.

Never claim an event exists without successful confirmation.

The existing local Apogee calendar file is:

06_Daily_Rhythms\Calendar.md

The architecture should support Apogee's own calendar knowledge/state.

Google Calendar may be used as an integration, but do not assume every calendar request should automatically become a Google Calendar request.

---

# 13. BUILDER AGENT DEVELOPMENT SCHEDULE

The following is the authoritative development plan.

PHASE 1
October 1–4, 2026
Architecture Audit & Design

Objective:
- inspect the current system
- map existing capabilities
- identify gaps
- design the controlled intent architecture
- preserve working components

Focus:
Do not code blindly.

---

PHASE 2
October 5–11, 2026
Natural-Language Intent Layer

Objective:
Make Apogee reliably understand natural-language requests.

Focus:

- classify intent
- identify entities
- identify requested action
- identify target domain
- distinguish questions from actions
- distinguish deterministic actions from reasoning tasks
- handle multi-action requests safely

---

PHASE 3
October 12–18, 2026
Controlled Knowledge / Domain Actions

Objective:
Build structured write capabilities.

Initial domains:

- Exercise
- Bible / Reading
- Books
- Philosophy
- Calendar
- existing Projects

Focus:

Natural language → correct domain → controlled write → validation → truthful confirmation.

---

PHASE 4
October 19–25, 2026
Context Retrieval & Synthesis

Objective:

Make Apogee retrieve the right personal context before answering.

Focus:

- goals
- projects
- reading
- philosophy
- experience
- principles
- history
- current state

The system should retrieve relevant context rather than dumping everything into the model.

---

PHASE 5
October 26–November 1, 2026
Source Verification / Anti-Echo-Chamber

Objective:

Ensure Apogee can distinguish:

- source meaning
- user interpretation
- personal experience
- external evidence
- Apogee synthesis

Introduce external research where materially useful.

---

PHASE 6
November 2–8, 2026
Proactive Startup Briefing

Objective:

When Apogee starts, it should be able to provide a useful status/briefing.

Potential components:

- today's priorities
- calendar
- active projects
- pending actions
- recent important knowledge
- areas requiring updates
- relevant warnings

Keep it concise and useful.

---

PHASE 7
November 9–15, 2026
Life CEO Reasoning

Objective:

Move from retrieval to strategic reasoning.

Apogee should combine:

- personal context
- accumulated knowledge
- experience
- principles
- external wisdom
- current evidence

to help with decisions.

The output should be reasoning and recommendations, not merely retrieved notes.

---

PHASE 8
November 16–22, 2026
Full Integration, Hardening & Acceptance

Objective:

Integrate and test the complete system.

Test:

- voice
- intent
- controlled writes
- retrieval
- reasoning
- Calendar
- provenance
- external verification
- startup briefing
- truthfulness
- failure handling

Do not declare success merely because individual components work.

Test realistic end-to-end user requests.

---

# 14. SCHEDULE-AWARE APOGEE

Once Calendar capability is operational, Apogee should represent this development schedule as actual Calendar events/reminders.

Each phase reminder should contain:

- Phase name
- Date/window
- Primary objective
- Direct focus
- Instruction to stay focused on that phase and avoid unnecessary distractions

The schedule should become part of Apogee's persistent operating context.

---

# 15. DEVELOPMENT DISCIPLINE

Do not attempt to build the entire vision in one rewrite.

Work incrementally.

Before modifying important architecture:

1. Inspect existing implementation.
2. Identify the smallest necessary change.
3. Implement it.
4. Run focused tests.
5. Report exact files changed.
6. Report test results.
7. Only then proceed.

Preserve working functionality.

Do not unnecessarily modify:

- working voice pipeline
- Whisper configuration
- existing exercise functionality
- existing project structure
- existing vault rules

---

# 16. HARDWARE / SOFTWARE REALITY

The system must remain practical for the current hardware.

Current stack includes:

- Node.js
- Whisper.cpp
- FFmpeg
- local RAG
- Obsidian
- Ollama
- Qwen
- Claude
- Windows System.Speech

Do not design an architecture that assumes expensive local GPU infrastructure.

Use local computation where practical.

Use external models/research where they provide meaningful value.

Optimize for:

capability + reliability + cost efficiency

rather than maximum technical complexity.

---

# 17. TRUTHFULNESS

Apogee must never claim an action happened when it did not.

Examples:

If Calendar creation fails:

"The event was not created."

If a file write fails:

"I could not update the file."

If research was not performed:

Do not imply that external sources were checked.

If the system is uncertain:

State the uncertainty.

Evidence must determine confirmation.

---

# 18. FINAL TARGET

The finished Apogee Brain should feel like:

A personal intelligence system that learns from my experience, accumulated knowledge, and the experience/wisdom of other people, then uses that knowledge to help me reason better and act better.

It should be:

- voice enabled
- natural-language driven
- context aware
- provenance aware
- capable of controlled actions
- capable of structured memory
- capable of external verification
- capable of strategic reasoning
- increasingly proactive
- truthful about what it has and has not done

The ultimate model is:

Apogee = Second Brain + Chief of Staff + Life CEO

while I remain the final decision maker.

---

# BUILDER AGENT OPERATING RULE

Do not immediately implement everything above.

First perform Phase 1: Architecture Audit & Design against the existing Apogee Brain repository.

Return:

1. Current architecture map
2. Existing capabilities
3. Existing relevant files
4. What already works
5. What is missing
6. Conflicts or risks
7. Recommended implementation sequence
8. Exact first implementation step

Do not perform a massive rewrite.

Do not invent files or architecture without first inspecting the repository.

Preserve existing working functionality.

The objective is to evolve Apogee systematically into the Life CEO described above.
