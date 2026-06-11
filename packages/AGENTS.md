# Shared packages — working rules

The cross-deployable shared kernel. Before changing anything here, read
[`CONTEXT.md`](CONTEXT.md) for the vocabulary these packages own (Protocol,
Context Snapshot, Internal API, …), [`CHANGELOG.md`](CHANGELOG.md) for shipped
package deltas, root [`../AGENTS.md`](../AGENTS.md), and
[`../CONTEXT-MAP.md`](../CONTEXT-MAP.md).

## The packages

| Path                             | Owns                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`protocol/`](protocol/)         | WebSocket event schemas (Zod). The single source of truth for the client↔runtime wire format.                                                                 |
| [`api-contract/`](api-contract/) | Control Plane HTTP request/response schemas (public + internal).                                                                                              |
| [`domain-types/`](domain-types/) | Shared domain shapes not tied to a wire format. Owns the canonical `CLIENT_KINDS` tuple.                                                                      |
| [`providers/`](providers/)       | Shared cross-cutting clients (auth/JWKS, telemetry, feature flags).                                                                                           |
| [`boundary/`](boundary/)         | The one parse-at-boundary decode (`parseBoundary`/`BoundaryParseError`) for WS + HTTP (ADR-0004). See [`boundary/ARCHITECTURE.md`](boundary/ARCHITECTURE.md). |

## Contract-change rules

1. **`protocol/` is the source of truth for the wire format.** Change a WebSocket
   event here first; clients and the Agent Runtime follow. One protocol version is
   imported across the whole monorepo — stale imports fail typecheck. After changing
   `protocol/` or `api-contract/`, run `pnpm sensor:contract-drift` (hard CI gate).
2. **`api-contract/` changes before Control Plane implementation.** Add or change
   the request/response schema here first, then implement the endpoint.
3. **Decode at the boundary.** The decode lives once in `boundary/`
   (`parseBoundary`/`BoundaryParseError`); both contract packages surface it
   (`protocol`: `parseClientToRuntimeEvent` / `safeParse*`; `api-contract`:
   `parseBoundary`), so every inbound payload is parsed at the runtime boundary
   and never consumed raw. See [`../docs/CONVENTIONS.md`](../docs/CONVENTIONS.md)
   and [`../docs/adr/0004-shared-boundary-decode-package.md`](../docs/adr/0004-shared-boundary-decode-package.md).
4. **Providers are cross-cutting only.** `providers/` holds auth/telemetry/flags
   accessed by every deployable — it is not a home for domain logic or parsing.

## Verifying

These packages are plain TS libraries: `tsc` for typecheck, `node --test` against
the built `dist/` for tests (`test/*.test.mjs`). Run `pnpm test` at the root, or
`pnpm --filter @intentive/<pkg> test`. See [`../docs/TESTING.md`](../docs/TESTING.md).
