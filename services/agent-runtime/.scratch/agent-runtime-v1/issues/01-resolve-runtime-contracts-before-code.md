# Phase 0: Resolve Runtime Contracts Before Code

Status: ready-for-agent
Labels: ready-for-agent
Opened: 2026-05-28T04:17:46Z
Updated: 2026-05-28T04:17:46Z

## Description

## Parent

services/agent-runtime/.scratch/agent-runtime-v1/PRD.md

## What to build

Align the Agent Runtime planning contracts before implementation begins. The docs, ADRs, shared Protocol schemas, and Runtime reference guidance should agree that v1 uses the WebSocket Protocol for first-party Clients, scopes Runtime state by `user_id`, defers standalone `channels`, and keeps DeepAgents as the only agent brain.

## Acceptance criteria

- [ ] ADR-0034 is present and indexed as the accepted decision that first-party Mobile, Desktop, and future Android clients are not standalone channels in v1.
- [ ] ADR-0006, `docs/CONTEXT.md`, and the Agent Runtime plan agree that user overlays are scoped by `user_id`, not `tenant_id`.
- [ ] `packages/protocol` handshake and event names are checked against the current vocabulary in `docs/CONTEXT.md`.
- [ ] The initial persistence adapter direction is documented: direct Postgres, LangGraph store over Postgres, or a repo-owned adapter that can be swapped later.
- [ ] The initial Runtime bundle document set is documented.

## Blocked by

None - can start immediately

## Comments
