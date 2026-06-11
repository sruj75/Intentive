# @intentive/domain-types Architecture

This is the package-local architecture contract for `packages/domain-types/`. It extends the monorepo-wide rules in `../../ARCHITECTURE.md` and the vocabulary in `../CONTEXT.md`.

## Purpose

Shared in-process domain shapes that need the same TypeScript type in multiple deployables but are **not** sent over the network as-is. Wire-level shapes live in `@intentive/protocol` (WebSocket) and `@intentive/api-contract` (HTTP); this package is for the domain concepts behind them.

## Current surface

Defined in `src/index.ts`:

- **Branded identifiers** — `UserId`, `DeviceId`, `AgentInstanceId`, `MessageId` (nominal `string` brands so ids of different kinds cannot be mixed).
- **Devices** — `CLIENT_KINDS` (canonical `["mobile", "desktop", "android"]` tuple — wire packages derive their Zod enums from this), `ClientKind`, `Device`.
- **Agent Instance** — `AgentInstanceStatus`, `AgentInstance`.
- **Conversation** — `MessageRole`, `ConversationMessage`.

## Invariants

- Types only — no Zod schemas, no validation, no runtime behavior, no I/O.
- No wire-format concerns. If a shape is sent over the WebSocket it belongs in `@intentive/protocol`; if it is an HTTP body it belongs in `@intentive/api-contract`.
- Branded ids are the canonical way to type identifiers across deployables; prefer them over bare `string`.
- A type lives here only when it is genuinely shared by two or more deployables. Single-deployable types stay in that deployable's `types` layer.

## Boundaries

- **Consumers:** any deployable that needs a shared domain shape — typically `services/control-plane` and `services/agent-runtime`, and Clients where a shared shape is useful.
- **Sibling contracts:** `@intentive/protocol` and `@intentive/api-contract` own the wire shapes. Where a domain concept also has a wire representation, this package holds the in-process form and the contract packages hold the serialized form — they are reconciled, not duplicated.

> Note: `../../ARCHITECTURE.md` lists `ContextSnapshot` and `AccountState` as examples for this package, but in the current code `ContextSnapshot` lives in `@intentive/protocol` and `AccountState` lives in `@intentive/api-contract` because both are wire shapes. This package holds only the non-wire shapes above.

## Change protocol

1. Add a type here only when a second deployable needs the same shape.
2. If the concept is also serialized, define the wire form in the matching contract package and keep this in-process form aligned.
3. Run monorepo typecheck so all consumers pick up the change.
4. Check type and field names against `../CONTEXT.md` vocabulary before merging.
