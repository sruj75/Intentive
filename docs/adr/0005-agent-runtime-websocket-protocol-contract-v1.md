> **Status: Amended by [ADR-0035](0035-single-live-protocol-shape-v1.md).**
> v1 now uses a single live protocol shape with strict schemas and no `min_protocol`/`max_protocol` negotiation fields.

# ADR 0005: WebSocket Protocol Contract (v1)

## Status
Accepted (amended)

## Date
2026-05-25

## Context

Intentive clients need a stable, explicit runtime protocol contract. The protocol defines application-level WebSocket semantics (handshake + event schema), not low-level transport details.

## Decision

### 1) Handshake-first connection

- Client must complete `connect` before any runtime events are accepted.
- Pre-handshake, only `connect` is allowed.
- Non-`connect` pre-handshake frames are rejected with structured protocol error and no side effects.

### 2) Required `connect` fields (v1)

Mandatory:
- `auth_token`
- `client_kind` (`mobile` | `desktop` | `android`)
- `client_version`

### 3) Failure behavior

- Auth failure returns structured `auth_failed` and closes the socket.
- Invalid connect shape returns structured `invalid_connect`.
- Unsupported protocol shape returns structured `protocol_unsupported`.
- Runtime failures are emitted in the dedicated `runtime_error` envelope (see ADR-0035).

### 4) Reconnect and consistency

On connect/reconnect success:
- server returns snapshot first
- live updates stream after snapshot

### 5) Live stream reliability (v1)

Outbound live stream semantics are at-most-once. Recovery is via authoritative snapshot on reconnect (not replay/ack in v1).

## Consequences

### Positive

- Strong, simple contract for all first-party clients and runtime.
- Deterministic reconnect recovery with minimal handshake complexity.

### Negative

- No guaranteed replay of transient live events during disconnect windows.
