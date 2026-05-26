# Sessions

**Role:** Shell — **implement** in TypeScript.

## Load when

- `sessionKey` design, `sessions.json` / store, transcript paths, compaction.

## Do not use for

- Compacting LLM context inside DeepAgents (unless wiring shell → agent).

## Invariants

- Every inbound message resolves to a stable `sessionKey` before agent invoke.
- Store metadata separately from transcript blobs; document lifecycle in our types.
- Multi-user isolation is a shell concern, not an LLM prompt trick.

## Dig deeper

| Source | Command |
|--------|---------|
| OpenClaw | `rg -n "SECTION:sessions:compaction-doc" reference/openclaw/sessions-llms.txt` |
| OpenClaw | `rg -n "SECTION:sessions:session-key-ts" reference/openclaw/sessions-llms.txt` |

## Last resort

- `reference/openclaw/sessions-llms.txt`

[← Reference map](../AGENTS.md)
