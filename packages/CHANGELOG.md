# Changelog

All notable changes to the shared `packages/` kernel. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); packages will adopt [Semantic Versioning](https://semver.org/) once v1 ships.

## [Unreleased]

### Added

- **`@intentive/providers` — observability bootstrap + structured telemetry** ([Issue #42]) —
  `@intentive/providers/observability` owns Sentry init (`skipOpenTelemetrySetup: true`),
  Langfuse callback handler factory, and redacted structured logging via `createLogger`.
  v1 supports `SENTRY_MODE=errors-only` and `LANGFUSE_MODE=callback`; reserved OTel modes
  reject at bootstrap. Tests: `providers/test/observability.test.mjs`,
  `providers/test/telemetry.test.mjs`.
- **`@intentive/protocol` — optional `client_tz` on `connect`** ([Issue #39]) —
  clients may report an IANA timezone on every WebSocket handshake so the Agent
  Runtime can resolve wall-clock Cron schedules while the user is offline.
  Tests: extended `protocol/test/contract.test.mjs`.
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

- **`@intentive/api-contract` — `AccountState.has_desktop_client`** ([Issue #47]) —
  `GET /me` now reports whether any registered device in the Control Plane Device Registry
  has `client_kind === "desktop"`. Registered/present only — not live session state. Mobile
  uses it for capability-honest Mac setup promotion in **Companion Chat**. Tests extended in
  `api-contract/test/contract.test.mjs`; `ARCHITECTURE.md` field list synced.
- **`@intentive/providers/telemetry`** — exported `errorMessage(error)` as the canonical
  error→string helper for structured log attrs and durable error columns; tests extended
  in `providers/test/telemetry.test.mjs`.
- **`@intentive/api-contract`** — `parseBoundary` / `BoundaryParseError` re-exported from
  `@intentive/boundary` (HTTP call sites keep importing from `@intentive/api-contract` unchanged);
  `ClientKind` Zod enum now derived from `CLIENT_KINDS`.
- **`@intentive/protocol`** — `parseClientToRuntimeEvent` / `parseRuntimeToClientEvent` delegate to
  `parseBoundary`, so the WebSocket boundary throws the same leak-free `BoundaryParseError` as HTTP
  (replacing raw `ZodError` leakage). `safeParse*` wrappers unchanged.
- **`packages/AGENTS.md`** — documents `boundary/` in the package table and the consolidated
  decode-at-boundary rule.

[Issue #39]: https://github.com/sruj75/Intentive/issues/39
[Issue #42]: https://github.com/sruj75/Intentive/issues/42
[Issue #47]: https://github.com/sruj75/Intentive/issues/47
