# @intentive/protocol Architecture

This is the package-local architecture contract for `packages/protocol/`. It extends the monorepo-wide rules in `../../docs/ARCHITECTURE.md` and the vocabulary in `../../docs/CONTEXT.md` → **Protocol**. See ADR-0005 for the contract decision.

## Purpose

The single source of truth for the **WebSocket** message contract between every Client and the Agent Runtime. Every event a Client sends or the Agent Runtime emits is defined here as a Zod schema. **This is where client unification lives** — not in network topology. Mobile, Desktop, future Android, and the Agent Runtime all import from this package; a change here cascades through the monorepo via typecheck.

## Current surface

Defined in `src/index.ts`:

- **Shared primitives** — `ClientKind` (`mobile | desktop | android`).
- **Client → Runtime** (`clientToRuntimeEvent` discriminated union): `connect`, `user_message`, `presence_update`, `delivery_ack`, `context_snapshot`, `session_end_marker`.
- **Runtime → Client** (`runtimeToClientEvent` discriminated union): `hello_ok`, `companion_message`.
- **Version negotiation** — `connect` carries `min_protocol`/`max_protocol`; `hello_ok` returns `negotiated_protocol`.
- **Backward-compatible aliases** — `ConnectFrame`, `HelloOkFrame`, `InboundEvent`, `OutboundEvent`, etc., re-exporting the canonical schemas.

## Invariants

- Every wire event is a Zod schema here; no deployable defines its own copy of an event shape.
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
4. Bump and negotiate the protocol version when a change is not backward-compatible; keep one version live across the monorepo.
5. Check new event names against `../../docs/CONTEXT.md` vocabulary before merging.
