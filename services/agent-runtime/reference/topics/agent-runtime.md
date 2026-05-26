# Agent runtime (parity)

**Role:** Parity reference — **do not port inner loop**.

## Load when

- Understanding OpenClaw auto-reply / context-engine **boundaries** vs our DeepAgents integration.

## Do not use for

- Copying OpenClaw `auto-reply` or `context-engine` into the shell.

## Invariants

- **DeepAgents** is the only agent brain in v1-deepagent.
- Shell invokes DeepAgents per turn with session + workspace context.
- Read packs to avoid duplicating planning, thinking tokens, or compression logic.

## Dig deeper

| Source | Command |
|--------|---------|
| OpenClaw | `rg -n "SECTION:agent-runtime:thinking-doc" reference/openclaw/agent-runtime-llms.txt` |

## Last resort

- `reference/openclaw/agent-runtime-llms.txt`

[← Reference map](../AGENTS.md)
