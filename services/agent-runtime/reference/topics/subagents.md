# Subagents (parity)

**Role:** Parity reference — **use DeepAgents subagents**.

## Load when

- Comparing OpenClaw spawn/delegation models before wiring DeepAgents subagent config.

## Do not use for

- Implementing a custom subagent process manager in the shell (unless thin spawn IPC).

## Invariants

- **DeepAgents** owns subagent lifecycle and context isolation.
- Shell may track **tasks** when a subagent run was triggered via cron/channel (see [cron](cron.md)).
- OpenClaw sandbox/multi-agent docs inform policy, not our process model.

## Dig deeper

| Source | Command |
|--------|---------|
| OpenClaw | `rg -n "SECTION:subagents:doc" reference/openclaw/subagents-llms.txt` |

## Last resort

- `reference/openclaw/subagents-llms.txt`

[← Reference map](../AGENTS.md)
