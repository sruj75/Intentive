# Routing and isolation

**Role:** Shell — **implement** in TypeScript.

## Load when

- `sessionKey` routing rules, channel→session mapping, multi-tenant allowlists.

## Do not use for

- LLM-based routing of tool calls (DeepAgents).

## Invariants

- Routing is deterministic from config + inbound metadata, not model-guessed.
- Cross-tenant leakage is a critical bug — test matrix per channel type.
- Align with [sessions](sessions.md) for key format.

## Dig deeper

| Source | Command |
|--------|---------|
| OpenClaw | `rg -n "SECTION:routing:channel-routing" reference/openclaw/routing-llms.txt` |

## Last resort

- `reference/openclaw/routing-llms.txt`

[← Reference map](../AGENTS.md)
