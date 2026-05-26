# Architecture (brain vs shell)

**Role:** Context — not a code module.

## Load when

- Starting any shell work, or unsure what belongs in gateway vs DeepAgents.

## Do not use for

- Line-by-line implementation (use gateway, sessions, etc.).

## Invariants

- **DeepAgents** = planning, tool loop, vfs, subagents, long-term memory.
- **Our shell** = gateway, sessions, channels, cron, heartbeat, workspace loader, routing, hooks.
- OpenClaw = always-on agent OS reference; treat packs as behavioral reference, not code to paste.

## Dig deeper

| Source | Command |
|--------|---------|
| OpenClaw | `rg -n "SECTION:architecture:vision" reference/openclaw/architecture-llms.txt` |
| OpenClaw | `rg -n "SECTION:architecture:openclaw-start" reference/openclaw/architecture-llms.txt` |

## Last resort

- `reference/openclaw/architecture-llms.txt`

[← Reference map](../AGENTS.md)
