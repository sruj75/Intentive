# @intentive/protocol Architecture

This is the package-local architecture contract for `packages/protocol/`. It extends the monorepo-wide rules in `../../docs/ARCHITECTURE.md` and the vocabulary in `../../docs/CONTEXT.md` → **Protocol**. See ADR-0005 for the contract decision.

## Purpose

The single source of truth for the **WebSocket** message contract between every Client and the Agent Runtime. Every event a Client sends or the Agent Runtime emits is defined here as a Zod schema. **This is where client unification lives** — not in network topology. Mobile, Desktop, future Android, and the Agent Runtime all import from this package; a change here cascades through the monorepo via typecheck.

## Current surface

Defined in `src/index.ts`:

- **Shared primitives** — `ClientKind` (`mobile | desktop | android`).
- **Client → Runtime** (`clientToRuntimeEvent` discriminated union): `connect`, `user_message`, `presence_update`, `delivery_ack`, `context_snapshot`, `session_end_marker`.
- **Runtime → Client** (`runtimeToClientEvent` discriminated union): `hello_ok`, `companion_message`, `runtime_error`.
- **Runtime error envelope** — one typed error event shape with `code`, `message`, and optional `details`.
- **Single-live shape policy** — no backward-compatible alias exports; only canonical schema names are exported.

## Invariants

- Every wire event is a Zod schema here; no deployable defines its own copy of an event shape.
- Every wire object schema is strict; unknown keys are rejected.
- Inbound and outbound events are discriminated on `type` so the Agent Runtime can route exhaustively and clients can narrow safely.
- The package is imported at exactly **one version** across the monorepo (inviolable rule 5). Stale imports fail typecheck.
- Clients are distinguished only by the `client_kind` field on `connect` — never by separate channel adapters or separate event sets.
- This package contains schemas and types only. No transport, no I/O, no client SDK behavior — those are implementation details that live in each consumer's `providers/` boundary.

## Boundaries

- **Consumers:** `apps/mobile`, `apps/desktop`, future Android, and `services/agent-runtime` (its `protocol` domain parses these events).
- **Not a consumer:** the Control Plane. It issues Routing and is never on the WebSocket data path, so it does not import this package.
- **Sibling contracts:** HTTP shapes live in `@intentive/api-contract`; non-wire domain shapes live in `@intentive/domain-types`. Keep wire concerns out of those packages.

## Change protocol

1. Edit the Zod schema here first.
2. Run monorepo typecheck — every consumer that fails to handle the change is surfaced mechanically.
3. Add the handler/emitter in each affected deployable's `protocol`/`chat`/`snapshots` domain.
4. Keep one live protocol shape across the monorepo and update all first-party consumers in the same change stream.
5. Check new event names against `../../docs/CONTEXT.md` vocabulary before merging.
