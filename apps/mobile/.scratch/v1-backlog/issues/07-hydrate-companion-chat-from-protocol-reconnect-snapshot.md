# Hydrate Companion Chat from Protocol reconnect snapshot

Status: open
Labels: ready-for-agent
Opened: 2026-05-22T12:15:01Z
Updated: 2026-05-27T00:00:00Z

## Description

## Parent

#1

## What to build

Wire **Companion Chat** to authoritative **Conversation History** from the **Agent Runtime** via the **Protocol** reconnect snapshot. The **Mobile Client** does not persist messages on disk — it hydrates the thread on cold open and keeps only ephemeral in-memory state for composing, delivery status, and retry while the app is running.

Messages enter the UI through the Protocol WebSocket client boundary established in #6 (not a local durable message store). After reconnect, render the server-provided timeline in order; append outbound and inbound events as the live session progresses.

## Acceptance criteria

- [ ] On cold open (and after WebSocket reconnect), Companion Chat renders **Conversation History** from the Protocol reconnect snapshot — no local SQLite/AsyncStorage message database.
- [ ] Rendered messages include stable id, role, timestamps, and runtime metadata as defined by `packages/protocol/`.
- [ ] Ephemeral in-memory state covers composer draft, in-flight send, delivery status updates, and retry — cleared when the process ends unless the snapshot already includes the committed message.
- [ ] User sends and assistant replies flow through the #6 Protocol client boundary; the UI does not invent or persist a parallel transcript.
- [ ] After app restart, thread continuity comes from the reconnect snapshot, not from on-device message storage.
- [ ] Tests cover snapshot hydration ordering, live append during session, delivery-status updates, malformed snapshot rejection, and empty-history first open (bootstrap opening owned by #6/#8).

## Blocked by

- #6

## Comments

### 01 @alignment — 2026-05-27T00:00:00Z

Rewritten from the pre-monorepo local-persistence issue to match `docs/CONTEXT.md`: **Conversation History** is server-truth on the **Agent Runtime**; **Mobile Client** reads via Protocol reconnect snapshot only.
