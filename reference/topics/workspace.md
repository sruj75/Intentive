# Workspace conventions

**Role:** Shell loader + DeepAgents instructions — **implement** workspace paths and loading in TS.

## Load when

- `SOUL.md`, `AGENTS.md`, `SKILL.md`, `MEMORY.md`, skills layout, context files.

## Do not use for

- Replacing DeepAgents system prompt assembly (wire files into agent config).

## Invariants

- Workspace files live on disk (or vfs); shell **loads** and passes to DeepAgents per session.
- `AGENTS.md` in workspace is user/agent instructions, not `reference/AGENTS.md`.
- Skills are discoverable folders with `SKILL.md`, not ad-hoc prompt blobs.

## Dig deeper

| Source | Command |
|--------|---------|
| OpenClaw | `rg -n "SECTION:workspace:soul-template" reference/openclaw/workspace-llms.txt` |
| OpenClaw | `rg -n "SECTION:workspace:agents-template" reference/openclaw/workspace-llms.txt` |
| OpenClaw | `rg -n "SECTION:workspace:skills-doc" reference/openclaw/workspace-llms.txt` |

## Last resort

- `reference/openclaw/workspace-llms.txt`

[← Reference map](../AGENTS.md)
