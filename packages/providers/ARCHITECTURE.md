# @intentive/providers Architecture

This is the package-local architecture contract for `packages/providers/`. It extends the monorepo-wide rules in `../../docs/ARCHITECTURE.md` → "Cross-cutting via Providers." For vocabulary, see `../../docs/CONTEXT.md`.

## Purpose

The single explicit interface for cross-cutting concerns. Auth, telemetry, feature flags, and future cross-cutting clients live here behind stable interfaces so the underlying backend (OpenTelemetry, a flags vendor, etc.) can change without touching domain code. Domain code must import these from `@intentive/providers` (or its own deployable's `providers/` re-export) — never directly from the underlying SDKs (inviolable rule 3).

## Current surface

`src/index.ts` is a barrel; prefer subpath imports (`@intentive/providers/auth`) so consumers pull only what they need.

- **`auth.ts`** — `createJwtVerifier({ jwks_url, issuer, audience })` → `JwtVerifier` resolving a typed `VerifiedPrincipal` (`{ user_id }`). Both the Control Plane and the Agent Runtime verify Neon Auth JWTs through this one boundary. **Currently a stub that throws "Not implemented".** See `.scratch/v1-backlog/issues/09-SHARED-implement-providers-auth-jwks-verifier.md`.
- **`telemetry.ts`** — `createLogger(name)` → `Logger` (`info`/`warn`/`error` with structured attrs). **Currently a no-op stub.**
- **`flags.ts`** — `createFlagClient({ defaults })` → `FlagClient` with synchronous `isEnabled`. **Currently defaults-only.**

## Invariants

- This package is the only sanctioned path for auth, telemetry, feature flags, and connector clients across deployables.
- Interfaces are stable; the backing implementation is swappable. Callers depend on the interface, not the SDK.
- The auth verifier is shared verbatim by the Control Plane (`identity` domain) and the Agent Runtime (`gateway` domain) — there is no second, deployable-local JWT verifier.
- Connector clients that are owned by a single deployable (e.g. the Control Plane's APNs client, a Neon pool) may be exposed through that deployable's own `providers/` re-export rather than shipped here. Only genuinely cross-deployable clients live in this package.
- Telemetry must never emit auth tokens, conversation bodies, user memory, or Context Snapshot content; redaction is part of the contract.

## Boundaries

- **Consumers:** `services/control-plane` and `services/agent-runtime` (auth, telemetry, flags); Clients consume cross-cutting concerns through their own `providers/` boundary, sourcing shared ones from here.
- **Sibling packages:** wire/HTTP contracts live in `@intentive/protocol` and `@intentive/api-contract`; non-wire domain shapes in `@intentive/domain-types`. This package is behavior/clients, not shapes.
- **Enforcement:** the provider-only cross-cutting lint in `tools/linters/` fails any domain that imports auth/telemetry/flags from anywhere except here or a sanctioned re-export.

## Change protocol

1. Add or evolve the interface here first; keep it minimal and deep.
2. Replace a stub with a real implementation behind the unchanged interface (e.g. the JWKS verifier) so consumers need no change.
3. For a new cross-cutting concern, decide whether it is genuinely shared (lives here) or single-deployable (lives in that deployable's `providers/`).
4. Run monorepo typecheck and the provider lint before merging.
