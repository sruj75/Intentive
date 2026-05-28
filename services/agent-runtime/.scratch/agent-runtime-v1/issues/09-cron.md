# Phase 8: Cron

Status: ready-for-agent
Labels: ready-for-agent
Opened: 2026-05-28T04:17:46Z
Updated: 2026-05-28T04:17:46Z

## Description

## Parent

services/agent-runtime/.scratch/agent-runtime-v1/PRD.md

## What to build

Implement Cron as the Agent Runtime's durable scheduled-trigger primitive. Cron schedules work; it does not directly notify the User. On fire, it should enqueue a Runtime event for the User and let Companion behavior decide whether to Post-Message-Back.

## Acceptance criteria

- [ ] Durable Cron job records include user scope, schedule, payload, status, and next-fire time.
- [ ] The scheduler loop runs without blocking the gateway event loop.
- [ ] Cron fires append Runtime events into the relevant User's ordered queue.
- [ ] Execution records are tracked separately from schedule definitions.
- [ ] Cron survives Runtime restart.
- [ ] Missed or late fire behavior is documented and covered by tests.
- [ ] Cron fire does not equal notification.

## Blocked by

- 05-conversation-history-and-reconnect-snapshot.md

## Comments
