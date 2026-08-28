# Model routing

Use the least costly model that can reliably complete the task.

| Task type | Route | Escalation trigger |
| --- | --- | --- |
| Formatting, note extraction, simple updates | Fast / low-cost model | Ambiguity or multi-file reasoning |
| Research synthesis, coding, workflow design | Standard model | High-risk decision or repeated failure |
| Architecture, legal/financial review, final verification | High-reasoning model with human review | Never auto-execute consequential actions |

## Fallback policy
- If the primary provider fails, record the failure in the session log and use an approved secondary model only for non-sensitive work.
- Do not send credentials or private records to a model unless that use is approved.
