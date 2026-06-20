# Shared packages — working rules

Read this when working under `packages/`.

The cross-deployable shared kernel. Before changing anything here, read
[`CONTEXT.md`](CONTEXT.md) for the vocabulary these packages own (Protocol,
Context Snapshot, Internal API, …), [`CHANGELOG.md`](CHANGELOG.md) for shipped
package deltas, root [`../AGENTS.md`](../AGENTS.md), and
[`../CONTEXT-MAP.md`](../CONTEXT-MAP.md).

## Local contracts

- **Deployables import packages; packages never import deployables.** No `apps/**` or `services/**` imports from here, and nothing under `packages/` may import back into a deployable.
- **Wire shapes live here, not in deployables.** Clients and servers consume `@intentive/protocol` and `@intentive/api-contract`; they do not redefine event or HTTP schemas locally.
- **Dependency order:** `domain-types` and `boundary` are leaves; `protocol` and `api-contract` depend on both; `providers` is standalone cross-cutting infrastructure.

## The packages

| Path                             | Owns                                                                                              | Local docs                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [`protocol/`](protocol/)         | WebSocket event schemas (Zod). The single source of truth for the client↔runtime wire format.     | [`README.md`](protocol/README.md), [`ARCHITECTURE.md`](protocol/ARCHITECTURE.md)         |
| [`api-contract/`](api-contract/) | Control Plane HTTP request/response schemas (public + internal).                                  | [`README.md`](api-contract/README.md), [`ARCHITECTURE.md`](api-contract/ARCHITECTURE.md) |
| [`domain-types/`](domain-types/) | Shared domain shapes not tied to a wire format. Owns the canonical `CLIENT_KINDS` tuple.          | [`README.md`](domain-types/README.md), [`ARCHITECTURE.md`](domain-types/ARCHITECTURE.md) |
| [`providers/`](providers/)       | Shared cross-cutting clients (auth/JWKS, telemetry, observability bootstrap, feature flags).      | [`README.md`](providers/README.md), [`ARCHITECTURE.md`](providers/ARCHITECTURE.md)       |
| [`boundary/`](boundary/)         | The one parse-at-boundary decode (`parseBoundary`/`BoundaryParseError`) for WS + HTTP (ADR-0004). | [`README.md`](boundary/README.md), [`ARCHITECTURE.md`](boundary/ARCHITECTURE.md)         |

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
