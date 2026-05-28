# ADR 0003: WebSocket Protocol Contract (v1)

## Status
Accepted

## Date
2026-05-25

## Context

Intentive clients (`v1-expo`, `v1-tauri`) need a stable, explicit runtime protocol contract to integrate with `v1-deepagent` without ambiguity. The system targets a strong foundation with minimal complexity and clear upgrade paths.

## Decision

Adopt the following v1 WebSocket protocol contract.

### 1) Protocol meaning

"Protocol" means the application-level WebSocket message contract (handshake + frame/event schema), not low-level transport internals.

### 2) Handshake-first connection

- Client must complete `connect` before any runtime events are accepted.
- Pre-handshake, only `connect` is allowed.
- Non-`connect` pre-handshake frames are rejected with structured protocol error and no side effects.

### 3) Required `connect` fields (v1)

Mandatory:
- `auth_token`
- `client_kind` (`mobile` | `desktop`; `android` reserved) — per the `ClientKind` enum in `packages/protocol/`
- `client_version`
- `min_protocol`
- `max_protocol`

All other connect metadata is optional in v1.

### 4) Version compatibility

If client and server protocol ranges do not overlap, connect is rejected with `protocol_unsupported` structured error.

### 5) Auth failure behavior

On auth failure, return structured `auth_failed` error and close the socket.

### 6) Reconnect and consistency

On connect/reconnect success:
- server returns snapshot first
- live updates stream after snapshot

### 7) Live stream reliability (v1)

Outbound live stream semantics are at-most-once. Recovery is via authoritative snapshot on reconnect (not replay/ack in v1).

## Consequences

### Positive

- Strong, simple contract for all clients.
- Fast failure on contract mismatch.
- Deterministic reconnect recovery.
- Lower implementation complexity than replay/ack delivery in v1.

### Negative

- No guaranteed replay of every transient live event during disconnect windows.
- If stronger delivery guarantees are needed later, protocol extension work is required.

### Neutral / Follow-up

- Future ADR may introduce optional replay/ack semantics if product evidence shows snapshot recovery is insufficient.
