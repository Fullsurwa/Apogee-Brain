# Apogee SKOPE / Apogee Brain

Apogee SKOPE is the current working local executive operating system for the Apogee Brain project. It is designed to support a personal knowledge-and-action workflow around a vault-based context model, structured memory, deterministic operations, and AI assistance.

This repository preserves the current working architecture as the canonical version of the system. It is not a redesign, not a rebuild, and not a refactor of the active runtime.

## What problem it is designed to solve

Apogee is intended to help a single operator maintain a coherent operational picture across:

- daily scheduling and calendar awareness
- health and movement tracking
- action-list and dashboard prioritization
- structured memory and evidence tracking
- local vault context used as the system of record
- AI support via a primary Claude path and an Ollama local fallback
- deterministic handling for recurring operational tasks like logging exercise, reading context, and summarizing state

The system is built around keeping the usable working context close to the user’s vault rather than depending on a remote-only database or a fragile one-off pipeline.

## High-level architecture

The current system has four primary layers:

1. Vault and context layer
   - Core project notes in the vault directories
   - Command center and daily rhythm notes
   - local memory and interaction history
   - structured records for facts, hypotheses, experience, and validation

2. Runtime engine
   - Node.js local engine in [03_Active_Engine/Brains/core-engine/apogee_core.js](03_Active_Engine/Brains/core-engine/apogee_core.js)
   - Express HTTP dashboard endpoint on localhost
   - direct command loop for local interactive operation

3. AI routing layer
   - Claude as the primary model path
   - local Ollama as a fallback path
   - deterministic responses for routine actions when AI is unavailable or failed

4. Local operational files
   - dashboard notes
   - session logs
   - memory json store
   - personal vault files and daily rhythm records

## Core runtime files

- [apogee_core.js](apogee_core.js): root shim that loads the active engine.
- [03_Active_Engine/Brains/core-engine/apogee_core.js](03_Active_Engine/Brains/core-engine/apogee_core.js): canonical runtime engine.
- [Start_Apogee.bat](Start_Apogee.bat): Windows launcher script.
- [package.json](package.json): root package manifest.
- [03_Active_Engine/Brains/core-engine/package.json](03_Active_Engine/Brains/core-engine/package.json): engine package manifest.
- [.env.example](.env.example): environment variable template.

## Claude primary AI path

The current runtime is configured to prefer Anthropic Claude for live model interaction. The engine reads the API key from the environment and initializes the Anthropic client at startup.

The system intentionally logs whether the API key is present or missing, without exposing the literal secret value. This keeps startup diagnostics useful while avoiding accidental leakage.

## Ollama fallback path

The runtime also supports a local Ollama request path. This is used when Claude fails or is unavailable. The fallback currently includes:

- Ollama base URL configuration
- model configuration
- timeout configuration
- request payload with num_predict: 400

This fallback is working, but it is not guaranteed to be fast under full vault-heavy prompts. The project’s current understanding is that the full payload can still take a long time depending on the machine and context size. The repository does not claim a fixed 60-second completion target for the full local fallback path.

## Vault and context architecture

The engine builds a dynamic vault context from a set of operational files, including:

- daily calendar
- exercise log
- command-center dashboard
- recent interaction history
- memory summaries
- AI idea inbox
- recently modified notes

This is intentionally centered on the local vault and daily workflow documents rather than on a database-first architecture.

## Structured memory

The runtime maintains structured memory in Session Logs entries, including:

- facts
- hypotheses
- lessons
- experiences
- project validations

This memory is intended to support evidence-based decision-making and validation, rather than treating AI ideas as active projects without support.

## Deterministic action handling

The engine includes deterministic logic for actions like:

- exercise and step logging
- calendar lookup
- status checks
- recent interaction retrieval
- local fallback responses when the model is not available

These actions are intentionally explicit and predictable; they are a core part of the current architecture.

## Current status

This is the current working iteration of Apogee Brain and is treated as the canonical operational version.

The current repository state includes:

- Claude-first runtime flow
- local Ollama fallback flow
- vault-driven context assembly
- consistent startup diagnostics
- structured memory records
- deterministic workflow handlers
- dashboard/context integration

## Known limitations

The current project is intentionally documented as-is. It is not a generic public app and not a polished distributed product.

Important caveats:

- the project depends on local vault files and local runtime context
- Claude requires a valid environment token
- Ollama can be slower when the vault context is large
- the system is tuned for the current machine and workflow, not a generic SaaS deployment
- some local/private files, generated histories, and machine-specific paths are intentionally excluded from public sharing

## Environment configuration

Before starting the application, create a local .env file from [.env.example](.env.example) and configure only the values that are needed for your environment.

Required values:

- ANTHROPIC_API_KEY
- ANTHROPIC_MODEL (optional override)
- APOGEE_VAULT_PATH (optional if the project is run from the vault root)
- OLLAMA_BASE_URL (optional)
- OLLAMA_MODEL (optional)
- OLLAMA_TIMEOUT_MS (optional)
- PORT (optional)

Do not commit .env files or real credentials.

## How to start the application

From the project root:

1. Ensure Node.js dependencies are installed.
2. Configure .env locally.
3. Run:

   npm install
   node 03_Active_Engine/Brains/core-engine/apogee_core.js

Or use the bundled Windows launcher:

- [Start_Apogee.bat](Start_Apogee.bat)

## Basic verification

A minimal verification should confirm that:

- the engine starts without crashing
- startup diagnostics print the model and vault settings
- the local dashboard is reachable at http://localhost:3000
- Claude can respond if the environment is configured
- Ollama fallback can be attempted if Claude fails

The repository is not claiming a hardened public test suite beyond the current runtime checks.

## Intentionally excluded from GitHub

The public repository should not include:

- .env files or any secret values
- credentials.json or token.json
- local vault/private session data
- archived private projects and vault content
- generated runtime memory/history files
- local audio archives and private output artifacts
- machine-specific Absolute paths
- personal or live operational data not meant for public distribution

This repository is meant to preserve the current Apogee architecture without exposing the private environment that supports it.

## Repository structure for packaging

The intended public-facing repository layout is:

- root project documents and runtime entry files
- [03_Active_Engine/Brains/core-engine](03_Active_Engine/Brains/core-engine) as the active engine folder
- [00_System](00_System) and [01_Apogee_Core](01_Apogee_Core) for operational rules and context
- [00_Command_Center](00_Command_Center) and [06_Daily_Rhythms](06_Daily_Rhythms) as current operational docs
- documentation and packaging files such as README, LICENSE, SECURITY, and CONTRIBUTING
- local/private material kept out of the Git history

## Security note

This project is not intended for unrestricted public publishing of private data. The canonical working version remains local and should be sanitized or excluded before publishing to a public GitHub repository.
