# Channels

**Role:** Shell — **implement** in TypeScript.

## Load when

- Channel adapters, inbound/outbound delivery, allowlists, per-channel config.

## Do not use for

- Message content generation (DeepAgents after routing).

## Invariants

- Channel layer routes to `sessionKey` — does not own the agent loop.
- Respect allow-from / pairing patterns from docs before enabling DMs.
- One adapter per platform; shared delivery helpers, not copy-paste per channel.

## Dig deeper

| Source | Command |
|--------|---------|
| OpenClaw | `rg -n "SECTION:channels:index-doc" reference/openclaw/channels-llms.txt` |

## Last resort

- `reference/openclaw/channels-llms.txt`

[← Reference map](../AGENTS.md)
