# Phase 9: Heartbeat

Status: ready-for-agent
Labels: ready-for-agent
Deployable: agent-runtime
Opened: 2026-05-28T04:17:46Z
Updated: 2026-05-28T04:17:46Z

## Description

## Parent

.scratch/v1-backlog/prds/agent-runtime-PRD.md

## What to build

Implement Heartbeat as the Runtime's periodic/liveness-trigger primitive. Heartbeat should evaluate state only when policy allows, enqueue constrained Runtime events, and stay silent unless Companion behavior deliberately chooses a user-visible result.

## Acceptance criteria

- [ ] Per-User Heartbeat state and policy are durable.
- [ ] Interval ticks run only when policy and liveness allow them.
- [ ] Heartbeat ticks enqueue Runtime events rather than invoking DeepAgents directly from a timer callback.
- [ ] Silent outcomes such as `HEARTBEAT_OK` are recognized and not forwarded as chat messages.
- [ ] Important system events can wake Heartbeat early when documented policy allows.
- [ ] Heartbeat can evaluate active capture state without spamming the User.

## Blocked by

- #32

## Comments
