# Phase 1: Runtime Skeleton And Domain Scaffolds

Status: ready-for-agent
Labels: ready-for-agent
Deployable: agent-runtime
Opened: 2026-05-28T04:17:46Z
Updated: 2026-05-28T04:17:46Z

## Description

## Parent

.scratch/v1-backlog/prds/agent-runtime-PRD.md

## What to build

Create the Agent Runtime domain skeleton and configuration baseline so future slices have stable module boundaries. The Runtime entrypoint should stay thin, while domains expose testable seams for gateway, sessions, protocol, runtime, memory, bundles, cron, heartbeat, and internal APIs.

## Acceptance criteria

- [ ] Agent Runtime domain folders exist for `gateway`, `sessions`, `protocol`, `runtime`, `memory`, `bundles`, `cron`, `heartbeat`, and `internal` using the repo layer convention.
- [ ] Runtime configuration validates ports, public WebSocket URL, internal API secret, Neon connection string, JWKS config, protocol version, and model/provider config.
- [ ] Domain-level test harnesses or fakes exist where needed before Neon or DeepAgents are wired.
- [ ] The process entrypoint delegates to Runtime composition instead of owning business logic.
- [ ] `pnpm --filter @intentive/agent-runtime typecheck` passes.

## Blocked by

- #10

## Comments
