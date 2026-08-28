# Vault rules

1. The five files in `01_Apogee_Core/AI_Context/` hold durable vault-wide business context.
2. Each active project keeps its current state in `03_Active_Engine/<project>/_Project_Context.md`.
3. `00_Command_Center/Now.md` is short-term memory only; move durable facts to context notes.
4. `Session Logs/` is chronological evidence, not a replacement for context files.
5. Use links instead of copying information between dashboards, archives, and project folders.
6. Archive completed projects under `04_Vault_Archive/`; do not treat archive notes as active context.
7. Never commit `.env`, `credentials.json`, `token.json`, API keys, OAuth tokens, or generated dependency folders.
