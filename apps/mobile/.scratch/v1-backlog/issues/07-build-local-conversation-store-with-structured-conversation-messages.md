# Build Local Conversation Store with Structured Conversation Messages

Status: open
Labels: ready-for-agent
Opened: 2026-05-22T12:15:01Z
Updated: 2026-05-22T12:15:01Z

## Description

## Parent

#1

## What to build

Persist Companion Chat locally on-device through a Conversation Store boundary using structured Conversation Messages. The slice should preserve thread continuity across app returns without treating history as a loose transcript blob.

## Acceptance criteria

- [ ] Conversation Messages include stable ID, role, timestamps, delivery status, and runtime metadata.
- [ ] User and assistant messages are appended through the Conversation Store boundary.
- [ ] Delivery status can be updated after send, error, retry, and response completion.
- [ ] Conversation history reloads into Companion Chat after app restart or remount.
- [ ] Storage implementation is local for MVP 1 but replaceable by later backend sync.
- [ ] Tests cover append, update, reload, ordering, and malformed message rejection.

## Blocked by

- #7

## Comments

(No comments.)
