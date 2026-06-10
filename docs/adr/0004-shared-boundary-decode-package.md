# ADR 0004: Shared boundary-decode package (`@intentive/boundary`)

## Status

Accepted

## Date

2026-06-11

## Context

"Parse at the boundary" is a system-wide convention (see [`docs/CONVENTIONS.md`](../CONVENTIONS.md)): inbound payloads are decoded through a Zod schema at the runtime boundary and never consumed raw. The system has **two** inbound boundaries:

- the **HTTP** boundary in the Control Plane (`identity`, `devices`, `routing` handlers), and
- the **WebSocket** boundary in the Agent Runtime (the connect handshake and message handler).

These had drifted into two different rejection behaviors:

- `@intentive/api-contract` owned `parseBoundary` / `BoundaryParseError` — a leak-free decode that throws an error surfacing only the offending **key paths**, never the values (the auth/credential hot path must not leak claims into logs).
- `@intentive/protocol` owned thin `parse*` wrappers that re-exposed a raw `ZodError`, which carries the rejected values.

The same concept ("decode this inbound payload, reject leak-free") had two homes and two error types. Nothing failed when they diverged.

The layer rule constrains where a shared decode can live: `protocol` cannot import `api-contract`; `domain-types` must stay Zod-free (it is the zero-dependency base); `providers` is cross-cutting only and barred from parsing. So neither existing package can host a decode that **both** wire packages depend on.

## Decision

Introduce a fifth shared package, **`@intentive/boundary`** (dependency: `zod` only), that owns the single parse-at-boundary decode for every inbound boundary:

1. `parseBoundary` and `BoundaryParseError` live in `@intentive/boundary`. There is one `BoundaryParseError` class, system-wide.
2. `@intentive/api-contract` re-exports `{ parseBoundary, BoundaryParseError }` from it, so HTTP call sites keep importing from `@intentive/api-contract` unchanged.
3. `@intentive/protocol`'s `parseClientToRuntimeEvent` / `parseRuntimeToClientEvent` delegate to `parseBoundary`, so the WebSocket boundary now throws the same leak-free `BoundaryParseError`. The `safeParse*` wrappers stay (the WS handler branches on a Zod result rather than throwing).

`@intentive/boundary` sits below both wire packages in the dependency graph (`zod`-only), so this respects the layer rule with no cycle.

## Consequences

### Positive

- One leak-free decode and one `BoundaryParseError` type for **every** inbound boundary, available for uniform boundary logging/telemetry.
- The credential-safety property (key paths only, never values) is now guaranteed at the WebSocket boundary too, not just HTTP.
- Adding a new inbound boundary has an obvious, single home to decode through.

### Negative

- A fifth shared package raises the count of moving parts in `packages/`. The alternative — duplicating the error type across the two wire packages — was rejected because it reproduces the exact drift this consolidates.
- Hard to reverse: a new package plus cross-package dependency edges (`protocol → boundary`, `api-contract → boundary`).

### Follow-up

- New inbound boundaries decode through `@intentive/boundary` rather than minting their own error type.
