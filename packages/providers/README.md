# @intentive/providers

The single explicit interface for cross-cutting concerns. See [`ARCHITECTURE.md`](../../ARCHITECTURE.md) → Cross-cutting Concerns (Providers).

Auth, telemetry, observability bootstrap, feature flags, and any future cross-cutting client lives here. Domain code must import these from `@intentive/providers` (or from its own deployable's `providers/` re-export) — never directly from underlying SDKs. Sentry and Langfuse init belong in `@intentive/providers/observability` only.

Feature flags are intentionally defaults-only until Intentive has a named production flag consumer. Add a real flags backend behind `createFlagClient` only when a specific deployable needs a live flag, not as speculative infrastructure.

The provider-only cross-cutting lint in `tools/linters/` enforces this rule on every PR.
