# Hooks and events

**Role:** Shell — **implement** in TypeScript (event bus).

## Load when

- Plugin/host hooks, lifecycle events, hook registration and ordering.

## Do not use for

- DeepAgents middleware (separate integration point).

## Invariants

- Hooks are typed events with explicit payloads — no stringly-typed global bus.
- Host hooks fire at gateway/session boundaries, not inside every tool call unless documented.
- Document failure mode: sync vs async, cancel propagation.

## Dig deeper

| Source | Command |
|--------|---------|
| OpenClaw | `rg -n "SECTION:hooks:hook-types-ts" reference/openclaw/hooks-llms.txt` |

## Last resort

- `reference/openclaw/hooks-llms.txt`

[← Reference map](../AGENTS.md)
