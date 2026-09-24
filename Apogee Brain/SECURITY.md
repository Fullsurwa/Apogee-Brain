# Security Policy

## Reporting a vulnerability

If you discover a security issue in this project, please do not disclose it publicly in the repository. Report it privately to the repository maintainer or the project owner before sharing details.

## Sensitive content

This project intentionally excludes secrets and private data from the public repository. Do not add:

- .env files
- API keys
- OAuth tokens
- passwords
- private keys
- personal vault data
- local machine paths
- session histories with sensitive information

## Local runtime expectations

The working Apogee environment is a local system with runtime data stored outside the public repository. The public repository is meant to document and preserve the architecture, not to include the private working state.

## Google Calendar OAuth

- Set `GOOGLE_CALENDAR_TOKEN_PATH` to a JSON token file outside the Obsidian vault.
- The token must use OAuth JSON fields such as `access_token`, optional `refresh_token`, `expiry_date`, and `scopes` or `scope`.
- The token must include `https://www.googleapis.com/auth/calendar.events`.
- Vault `token.json` and `credentials.json` files are not read or migrated by the Calendar event-creation runtime.
- Provision a token with `npm run calendar:authorize` after setting the client ID, client secret, and external token path. The command opens a localhost browser callback, requests offline access with the event scope, and creates no Calendar event.
