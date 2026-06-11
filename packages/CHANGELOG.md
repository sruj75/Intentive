# Changelog

All notable changes to the shared `packages/` kernel. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); packages will adopt [Semantic Versioning](https://semver.org/) once v1 ships.

## [Unreleased]

### Added

- **`@intentive/boundary`** ([monorepo ADR-0004](../docs/adr/0004-shared-boundary-decode-package.md)) —
  the one leak-free parse-at-boundary decode for every inbound boundary: `parseBoundary` and
  `BoundaryParseError` (key paths only, never values). Sits below both wire packages (`zod`-only).
  Tests: `boundary/test/parse.test.mjs`.
- **Canonical `CLIENT_KINDS` tuple** in `@intentive/domain-types` — the single source of truth for
  Client Kinds (`mobile`, `desktop`, `android`). `@intentive/protocol` and `@intentive/api-contract`
  derive their Zod enums from it so adding a client is one central edit. Tests:
  `domain-types/test/client-kinds.test.mjs`.
- **JWT verification failure taxonomy** in `@intentive/providers/auth` — `JwtVerificationReason`
  (`expired`, `invalid_signature`, `wrong_issuer`, `wrong_audience`, `unknown_key`,
  `jwks_unavailable`, `malformed`), `JwtVerificationError`, and `asJwtVerificationFailure` as the
  sanctioned way for deployables to recover a `reason` from a caught error without re-listing the
  taxonomy. Tests extended in `providers/test/auth.test.mjs`.

### Changed

- **`@intentive/api-contract`** — `parseBoundary` / `BoundaryParseError` re-exported from
  `@intentive/boundary` (HTTP call sites keep importing from `@intentive/api-contract` unchanged);
  `ClientKind` Zod enum now derived from `CLIENT_KINDS`.
- **`@intentive/protocol`** — `parseClientToRuntimeEvent` / `parseRuntimeToClientEvent` delegate to
  `parseBoundary`, so the WebSocket boundary throws the same leak-free `BoundaryParseError` as HTTP
  (replacing raw `ZodError` leakage). `safeParse*` wrappers unchanged.
- **`packages/AGENTS.md`** — documents `boundary/` in the package table and the consolidated
  decode-at-boundary rule.
