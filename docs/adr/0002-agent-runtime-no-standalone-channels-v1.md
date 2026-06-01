# No Standalone Channels Domain in Agent Runtime V1

## Status

Accepted

## Date

2026-05-28

## Context

The OpenClaw reference architecture includes a `channels` layer for external messaging adapters such as Discord, Telegram, CLI, or other surfaces that need channel-specific receive/reply mechanics.

Intentive v1 has a different boundary. The **Mobile Client**, **Desktop Client**, and future Android Client are first-party Clients that all speak the shared WebSocket **Protocol** defined in `packages/protocol/`. The **Mobile Client** sends `user_message` events and renders chat. The **Desktop Client** is capture-only and sends `context_snapshot` plus `session_end_marker` events. Client unification already lives in the Protocol, not in adapter-specific channel code.

## Decision

Do not build a standalone `channels` domain in the Agent Runtime v1.

Client-specific behavior belongs in:

- `gateway` for WebSocket connection, auth, and client handshake.
- `protocol` for validating and mapping shared event schemas.
- `sessions` for per-user ordering and idempotency.
- `runtime` for invoking DeepAgents from ordered events.

Reserve a future `channels` domain for non-Protocol external surfaces such as Discord, SMS, email, WhatsApp, or public partner integrations.

## Consequences

### Positive

- Keeps v1 smaller and avoids copying OpenClaw structure where Intentive's product boundary is different.
- Prevents Mobile/Desktop handling from being split between Protocol and channel adapters.
- Preserves the accepted decision that WebSocket Protocol is the client unification layer.

### Negative

- Adding a true external messaging surface later will require a new adapter layer.
- Some OpenClaw reference docs mention `channels`; implementers must translate those patterns into Intentive gateway/protocol/session behavior for v1.

### Follow-up

- Update reference topic cards and implementation plans to mark `channels` as future-only for Intentive v1.
- If an external channel is added later, write a new ADR defining its adapter boundary and delivery guarantees.
