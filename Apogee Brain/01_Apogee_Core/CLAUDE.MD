# Apogee Agent Brain

## Operating rules
- Start each task by reading `00_Command_Center/Now.md`, `00_System/Rules.md`, and the relevant project context.
- Treat the five files in `01_Apogee_Core/AI_Context/` as the durable, vault-wide business context.
- Keep project-specific decisions within that project's context file; link across projects rather than duplicate notes.
- Promote durable conclusions from session logs into the appropriate context file.
- Never place credentials, tokens, or API keys in Markdown, scripts, or committed files.

## Writing preferences
- Use clear Markdown headings and Obsidian links.
- Prefer concise summaries with links to source material.
- Mark assumptions and unresolved decisions explicitly.
