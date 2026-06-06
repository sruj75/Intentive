# @intentive/providers

The single explicit interface for cross-cutting concerns. See [`ARCHITECTURE.md`](../../ARCHITECTURE.md) → "Cross-cutting via Providers."

Auth, telemetry, feature flags, and any future cross-cutting client lives here. Domain code must import these from `@intentive/providers` (or from its own deployable's `providers/` re-export) — never directly from underlying SDKs.

The provider-only cross-cutting lint in `tools/linters/` enforces this rule on every PR.
