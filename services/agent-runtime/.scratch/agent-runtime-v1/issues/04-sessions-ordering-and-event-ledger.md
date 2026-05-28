# Phase 3: Sessions, Ordering, And Event Ledger

Status: ready-for-agent
Labels: ready-for-agent
Opened: 2026-05-28T04:17:46Z
Updated: 2026-05-28T04:17:46Z

## Description

## Parent

services/agent-runtime/.scratch/agent-runtime-v1/PRD.md

## What to build

Persist inbound and system events, then process them through one ordered queue per User. This slice establishes the Runtime's core safety invariant: concurrent Mobile, Desktop, Cron, and Heartbeat triggers for the same User serialize before they invoke Companion behavior.

## Acceptance criteria

- [ ] Every authenticated socket maps to `user_id`, `client_kind`, and Agent Instance.
- [ ] Inbound events are persisted with idempotency keys before processing.
- [ ] User message, context snapshot, session end, cron fire, heartbeat tick, and conversation start event kinds are represented.
- [ ] One ordered queue exists per `user_id`.
- [ ] Duplicate `message_id` or `snapshot_id` does not produce duplicate Runtime turns.
- [ ] Events for different Users can progress without blocking each other.

## Blocked by

- 03-websocket-gateway-and-internal-session-start.md

## Comments
