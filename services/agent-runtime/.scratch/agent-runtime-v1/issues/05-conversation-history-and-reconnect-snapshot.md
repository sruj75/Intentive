# Phase 4: Conversation History And Reconnect Snapshot

Status: ready-for-agent
Labels: ready-for-agent
Opened: 2026-05-28T04:17:46Z
Updated: 2026-05-28T04:17:46Z

## Description

## Parent

services/agent-runtime/.scratch/agent-runtime-v1/PRD.md

## What to build

Make Conversation History server-truth for the Mobile Client. User messages, Companion messages, and reconnect snapshots should all flow from Runtime-owned durable state rather than client-local chat storage.

## Acceptance criteria

- [ ] `user_message`, `companion_message`, and relevant system-visible timeline entries persist in Conversation History.
- [ ] The reconnect snapshot shape is defined in the shared Protocol instead of remaining an opaque `unknown`.
- [ ] Connected Mobile clients receive new outbound Companion messages over WebSocket.
- [ ] Desktop remains capture-only and receives no chat UI obligations.
- [ ] A Mobile cold open can render the authoritative timeline from the reconnect snapshot.
- [ ] Conversation History survives Runtime process restart.

## Blocked by

- 04-sessions-ordering-and-event-ledger.md

## Comments
