# Shared Contracts & Providers V1

Status: ready-for-agent
Labels: ready-for-agent
Opened: 2026-05-28T12:00:00Z
Updated: 2026-05-28T12:00:00Z

## Description

## Problem Statement

The shared packages are the seams that hold the four deployables together, but they have no tracker and are mostly stubs. `packages/protocol/` and `packages/api-contract/` define wire shapes that every Client, the Control Plane, and the Agent Runtime import — yet nothing owns "lock v1 and enforce one version." Worse, `packages/providers/src/auth.ts` (the Neon Auth JWKS verifier) currently **throws "Not implemented"**, even though Agent Runtime #03 requires "JWT verification uses the shared Providers auth boundary" and the Control Plane's identity domain requires the same. Telemetry is a no-op and feature flags are a defaults-only stub. This is the cross-cutting blind spot that sits underneath both the Control Plane and the Agent Runtime.

## Solution

Treat the shared packages as first-class, planned work in the `.scratch/shared/` tracker root (per `docs/agents/issue-tracker.md`). Lock the `protocol` and `api-contract` v1 surfaces with explicit version-negotiation and single-version rules, implement the real `providers` auth/telemetry/flags boundaries that the Control Plane and Agent Runtime depend on, keep `domain-types` aligned, and enforce the inviolable lint rules (layer direction, no cross-deployable imports, cross-cutting only via Providers, vocabulary, one protocol version) in CI.

## User Stories

1. As the Agent Runtime, I want a real shared JWKS verifier, so that I can authenticate WebSocket clients without a Control Plane proxy.
2. As the Control Plane, I want the same shared verifier, so that identity is verified identically on both services.
3. As any Client, I want a locked `protocol` version with explicit negotiation, so that `connect` → `hello_ok` either succeeds or fails for a clear reason.
4. As the Control Plane and Clients, I want `api-contract` to be the single source of truth for HTTP shapes, so that no deployable redefines a request/response body.
5. As an engineer, I want the inviolable rules enforced by CI, so that layer, boundary, and vocabulary violations fail before merge rather than rotting.

## Implementation Decisions

- `packages/protocol/` is imported at exactly one version across the monorepo (inviolable rule 5). Version negotiation semantics (`min_protocol`/`max_protocol` → `negotiated_protocol`) are locked in v1.
- `packages/api-contract/` owns both the public (JWT) and internal (shared-secret) HTTP surfaces. Deployables implement these schemas; they never redefine them.
- `packages/providers/` is the only sanctioned path for auth, telemetry, and feature flags (inviolable rule 3). The auth verifier wraps Neon Auth JWKS.
- `packages/domain-types/` holds in-process domain shapes (branded ids, Device, AgentInstance, ConversationMessage) and stays free of wire-format concerns.
- The five inviolable rules in `AGENTS.md` are enforced by lint/typecheck in CI, not by convention.

## Out of Scope

- Adding new Protocol events or endpoints beyond what v1 Clients/Control Plane/Runtime already require.
- External channel adapters (Discord/SMS/etc.) — deferred with the Agent Runtime's `channels` decision (ADR-0034).
- Replacing the telemetry/flags backend vendor; the interface is what is locked, not the vendor.

## Further Notes

- ADR-0005 records the WebSocket Protocol contract. ADR-0001 records the unified monorepo foundation.
- Agent Runtime #01 ("Resolve Runtime Contracts Before Code") and Control Plane #01 both depend on this tracker's #01 landing first.
- Inviolable rules and package ownership are documented in the root `AGENTS.md`.

## Comments
