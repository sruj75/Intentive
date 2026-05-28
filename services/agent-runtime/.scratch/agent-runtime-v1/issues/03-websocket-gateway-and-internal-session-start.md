# Phase 2: WebSocket Gateway And Internal Session Start

Status: ready-for-agent
Labels: ready-for-agent
Opened: 2026-05-28T04:17:46Z
Updated: 2026-05-28T04:17:46Z

## Description

## Parent

services/agent-runtime/.scratch/agent-runtime-v1/PRD.md

## What to build

Implement the first end-to-end connection path: the Control Plane can start a User session through the private Internal API, and a signed-in Client can connect to the Runtime WebSocket through the shared Protocol handshake.

## Acceptance criteria

- [ ] `POST /internal/sessions/start` is protected by shared-secret auth.
- [ ] Session Start creates or loads one Agent Instance for the provided `user_id` and is idempotent.
- [ ] WebSocket clients must send `connect` before any other event.
- [ ] JWT verification uses the shared Providers auth boundary.
- [ ] Invalid auth, unsupported protocol versions, and non-`connect` pre-handshake events return structured errors without Runtime side effects.
- [ ] Successful connect returns `hello_ok` with negotiated protocol and an authoritative reconnect snapshot.

## Blocked by

- 02-runtime-skeleton-and-domain-scaffolds.md

## Comments
