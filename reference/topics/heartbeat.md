# Heartbeat

**Role:** Shell — **implement** in TypeScript.

## Load when

- Periodic wake loop, `HEARTBEAT_OK` / silent replies, queueing system events for next tick.

## Do not use for

- Running the full agent graph on every timer tick without policy (budget, active hours).

## Invariants

- Heartbeat is a **shell scheduler** that may invoke DeepAgents with a constrained turn.
- `HEARTBEAT_OK`-style silent tokens must be recognized and not forwarded to users.
- Task completion may **wake** heartbeat early — coordinate with cron/task cards.

## Dig deeper

| Source | Command |
|--------|---------|
| OpenClaw | `rg -n "SECTION:heartbeat:doc" reference/openclaw/heartbeat-llms.txt` |
| OpenClaw | `rg -n "SECTION:heartbeat:template" reference/openclaw/heartbeat-llms.txt` |
| OpenClaw | `rg -n "SECTION:heartbeat:runner-ts" reference/openclaw/heartbeat-llms.txt` |

## Last resort

- `reference/openclaw/heartbeat-llms.txt`

[← Reference map](../AGENTS.md)
