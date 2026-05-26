# Cron and tasks

**Role:** Shell — **implement** in TypeScript.

## Load when

- Scheduled jobs, cron protocol, task ledger vs heartbeat.

## Do not use for

- Defining agent prompts for scheduled work (DeepAgents + workspace files).

## Invariants

- Cron **schedules**; tasks **record** what ran — do not merge into one concept.
- Heartbeat turns are not tasks; cron/subagent/CLI runs create task records (OpenClaw model).
- Scheduler must not block the gateway event loop.

## Dig deeper

| Source | Command |
|--------|---------|
| OpenClaw | `rg -n "SECTION:cron:tasks-doc" reference/openclaw/cron-llms.txt` |

## Last resort

- `reference/openclaw/cron-llms.txt`

[← Reference map](../AGENTS.md)
