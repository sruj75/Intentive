# Phase 11: Observability, Safety, And Production Readiness

Status: ready-for-agent
Labels: ready-for-agent
Deployable: agent-runtime
Opened: 2026-05-28T04:17:46Z
Updated: 2026-05-28T04:17:46Z

## Description

## Parent

.scratch/v1-backlog/prds/agent-runtime-PRD.md

## What to build

Harden the Agent Runtime for production operation. Operators should be able to understand connection, queue, turn, VFS, scheduler, and push behavior without exposing private content, and the service should restart safely on the always-alive GCE deployment shape.

## Acceptance criteria

- [ ] Structured logs exist for connection, event queue, DeepAgents turn, VFS access, Cron, Heartbeat, and push handoff boundaries.
- [ ] Metrics cover queue latency, turn duration, token usage, scheduler lag, connected clients, and push handoff failures.
- [ ] Logs redact user memory, conversation bodies, auth tokens, and snapshot content.
- [ ] Integration tests cover multi-User isolation and reconnect recovery.
- [ ] Restart smoke proves durable state survives process restart.
- [ ] Deployment workflow supports the GCE VM container rollout shape.

## Blocked by

- #31
- #33
- #34
- #35

## Comments
