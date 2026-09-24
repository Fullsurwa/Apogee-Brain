# Tools and integrations

| Tool | Evidence in vault | Role | Status |
| --- | --- | --- | --- |
| Obsidian | `.obsidian/` | Knowledge base and workspace | Connected |
| Obsidian Local REST API | `.obsidian/plugins/obsidian-local-rest-api/` | Local vault access | Installed |
| Obsidian MCP tools | `.obsidian/plugins/mcp-tools-istefox/`, `.obsidian-mcp/` | AI-to-vault tooling | Installed |
| Git / GitHub | configured `origin` remote | Version control | Connected |
| Anthropic SDK | `package.json` | Model API in local engine | Configured; verify credentials locally |
| Google Calendar helpers | `calendar_helper.py`, `gmail_helper.py` | Calendar/email automation | Present; verify authorization locally |
| Windows System.Speech | canonical core engine | Local voice output | Active; no external voice credential |
| Notion | No local evidence | Cross-project tasks | Not connected |

Do not store secrets in this note. Record setup location and owner when a new integration is added.
