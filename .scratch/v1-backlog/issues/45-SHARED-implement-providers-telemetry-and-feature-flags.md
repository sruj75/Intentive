# Phase 2: Implement Providers Telemetry And Feature Flags

Status: ready-for-agent
Labels: ready-for-agent
Deployable: shared
Opened: 2026-05-28T12:00:00Z
Updated: 2026-05-28T12:00:00Z

## Description

## Parent

.scratch/v1-backlog/prds/shared-contracts-PRD.md

## What to build

Turn the `packages/providers/` telemetry and flags stubs into real, production-usable boundaries. Telemetry is currently a no-op logger; flags is defaults-only. Both the Control Plane and Agent Runtime route all cross-cutting logging and flag checks through here (inviolable rule 3), so production readiness in both services depends on this.

## Acceptance criteria

- [ ] `createLogger(name)` emits structured logs to a real sink with stable field names, while keeping the `Logger` interface unchanged for callers.
- [ ] Telemetry includes a documented redaction policy so auth tokens, conversation bodies, user memory, and snapshot content never reach log fields.
- [ ] `createFlagClient` resolves from a real flags backend with the existing defaults as the unreachable-backend fallback, preserving the synchronous `isEnabled` API.
- [ ] The underlying telemetry/flags vendor can change without touching domain code (interface-stable).
- [ ] Tests cover structured field emission, redaction of sensitive keys, and flag resolution with backend-reachable and backend-unreachable paths.

## Blocked by

- #08

## Unblocks

- #44
- #36

## Comments
