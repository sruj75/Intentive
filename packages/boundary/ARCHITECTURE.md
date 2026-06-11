# @intentive/boundary Architecture

This is the package-local architecture contract for `packages/boundary/`. It extends the monorepo-wide rules in `../../ARCHITECTURE.md` and the parse-at-boundary convention in `../../docs/CONVENTIONS.md`. See monorepo [ADR-0004](../../docs/adr/0004-shared-boundary-decode-package.md) for the decision.

## Bird's-eye Overview

The single home for **decode-at-boundary** across Intentive. Every inbound payload — WebSocket events in the Agent Runtime and HTTP bodies in the Control Plane — passes through `parseBoundary` before entering domain code. One `BoundaryParseError` type, one leak-free rejection shape (key paths only, never values).

```text
raw inbound payload
        |
   parseBoundary(schema, raw)
        |
   typed value  |  BoundaryParseError (keys only)
        |
   service/repo layers (never see raw)
```

Wire packages re-export or delegate to this module; call sites keep importing from `@intentive/protocol` or `@intentive/api-contract` where they already do.

## Codemap

`src/index.ts`
: `parseBoundary`, `BoundaryParseError` — the entire public surface.

`test/parse.test.mjs`
: Leak-free rejection shape and strict-schema unknown-key handling.

## Architectural Invariants

- One decode implementation and one error type for every inbound boundary in the monorepo.
- On parse failure, surface only offending key paths — never payload values (credential-safety on the auth hot path).
- `zod` is the only dependency; no wire schemas, no I/O, no deployable imports.
- Sits **below** `@intentive/protocol` and `@intentive/api-contract` in the dependency graph (no cycles).
- Domain code must not call `.parse()` / `.safeParse()` on raw Zod schemas at call sites; use the contract-package helpers that delegate here.

## Boundaries

- **Consumers (indirect):** Agent Runtime WebSocket handlers via `@intentive/protocol`; Control Plane HTTP handlers via `@intentive/api-contract` (`parseBoundary` re-export).
- **Not a consumer:** Clients decode through the contract packages, not this package directly.
- **Sibling packages:** `@intentive/protocol` and `@intentive/api-contract` own wire shapes; `@intentive/domain-types` stays Zod-free; `@intentive/providers` is cross-cutting only and does not parse inbound payloads.

## Cross-cutting Concerns

- **Credential safety:** `BoundaryParseError.keys` is safe to log; rejected values are never attached.
- **Strict schemas:** `unrecognized_keys` issues are folded into the key list (not only Zod path segments).
- **Change protocol:** edit here first when the decode behavior changes; both wire packages pick it up through their re-exports/delegation. Run `pnpm sensor:contract-drift` after contract-package changes.
