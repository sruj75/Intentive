# Channels

**Role:** Future shell reference — **do not implement as a standalone v1 domain**.

## Load when

- Designing a future non-Protocol external surface such as Discord, SMS, email, WhatsApp, CLI, or partner integrations.
- Comparing OpenClaw channel adapter behavior while implementing Intentive gateway/protocol/session behavior.

## Do not use for

- Mobile, Desktop, or future Android v1 clients. They are first-party Clients speaking the shared WebSocket Protocol, not channel adapters.
- Message content generation (DeepAgents after routing).

## Invariants

- Intentive v1 has no standalone `channels` domain; see `docs/adr/0034-agent-runtime-no-standalone-channels-v1.md`.
- First-party client routing belongs in `gateway`, `protocol`, and `sessions`.
- If a future external channel is added, channel routing must resolve to a stable session before agent invoke.
- Future external channels must respect allow-from / pairing patterns before enabling DMs.
- Future external channels should use one adapter per platform with shared delivery helpers, not copy-paste per channel.

## Dig deeper

| Source | Command |
|--------|---------|
| OpenClaw | `rg -n "SECTION:channels:index-doc" reference/openclaw/channels-llms.txt` |

## Last resort

- `reference/openclaw/channels-llms.txt`

[← Reference map](../AGENTS.md)
