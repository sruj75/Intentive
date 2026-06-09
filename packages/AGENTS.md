# Shared packages — working rules

The cross-deployable shared kernel. Before changing anything here, read
[`CONTEXT.md`](CONTEXT.md) for the vocabulary these packages own (Protocol,
Context Snapshot, Internal API, …), root [`../AGENTS.md`](../AGENTS.md), and
[`../CONTEXT-MAP.md`](../CONTEXT-MAP.md).

## The packages

| Path                             | Owns                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| [`protocol/`](protocol/)         | WebSocket event schemas (Zod). The single source of truth for the client↔runtime wire format. |
| [`api-contract/`](api-contract/) | Control Plane HTTP request/response schemas (public + internal).                              |
| [`domain-types/`](domain-types/) | Shared domain shapes not tied to a wire format.                                               |
| [`providers/`](providers/)       | Shared cross-cutting clients (auth/JWKS, telemetry, feature flags).                           |

## Contract-change rules

1. **`protocol/` is the source of truth for the wire format.** Change a WebSocket
   event here first; clients and the Agent Runtime follow. One protocol version is
   imported across the whole monorepo — stale imports fail typecheck. After changing
   `protocol/` or `api-contract/`, run `pnpm sensor:contract-drift` (hard CI gate).
2. **`api-contract/` changes before Control Plane implementation.** Add or change
   the request/response schema here first, then implement the endpoint.
3. **Decode at the boundary.** Both contract packages export parse-at-boundary
   helpers (`protocol`: `parseClientToRuntimeEvent` / `safeParse*`; `api-contract`:
   `parseBoundary`). Inbound payloads are parsed at the runtime boundary, never
   consumed raw. See [`../docs/CONVENTIONS.md`](../docs/CONVENTIONS.md).
4. **Providers are cross-cutting only.** `providers/` holds auth/telemetry/flags
   accessed by every deployable — it is not a home for domain logic or parsing.

## Verifying

These packages are plain TS libraries: `tsc` for typecheck, `node --test` against
the built `dist/` for tests (`test/*.test.mjs`). Run `pnpm test` at the root, or
`pnpm --filter @intentive/<pkg> test`. See [`../docs/TESTING.md`](../docs/TESTING.md).
