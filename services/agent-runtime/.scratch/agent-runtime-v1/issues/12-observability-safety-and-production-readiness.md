# Phase 11: Observability, Safety, And Production Readiness

Status: ready-for-agent
Labels: ready-for-agent
Opened: 2026-05-28T04:17:46Z
Updated: 2026-05-28T04:17:46Z

## Description

## Parent

services/agent-runtime/.scratch/agent-runtime-v1/PRD.md

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

- 07-neon-backed-vfs-bundles-and-memory.md
- 09-cron.md
- 10-heartbeat.md
- 11-post-message-back-and-push-handoff.md

## Comments
