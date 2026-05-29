# Phase 0: Lock Protocol And API-Contract V1

Status: closed
Labels: closed
Deployable: shared
Opened: 2026-05-28T12:00:00Z
Updated: 2026-05-28T12:00:00Z

## Description

## Parent

.scratch/v1-backlog/prds/shared-contracts-PRD.md

## What to build

Lock the v1 wire surfaces in `packages/protocol/` and `packages/api-contract/` so every deployable can build against a frozen, version-negotiated contract. This is the root dependency for Agent Runtime #10, Control Plane #11, Mobile #27, and Desktop #25.

## Acceptance criteria

- [ ] `packages/protocol/` event names and the `connect` → `hello_ok` handshake are checked against `docs/CONTEXT.md` vocabulary and reconciled where they drift.
- [ ] Single-live-protocol policy is specified: clients and runtime move together on one canonical protocol shape/version in-repo, with no long-lived old/new compatibility window.
- [ ] Handshake is simplified for the single-live-protocol policy (no `min_protocol`/`max_protocol` range negotiation fields in `connect`).
- [ ] Protocol failure contract is explicit in `packages/protocol/` with typed failure events for at least `protocol_unsupported` and `auth_failed`.
- [ ] The single-protocol-version rule (inviolable rule 5) is documented and the version source is singular.
- [ ] Canonical wire field names from `packages/protocol/` are used end-to-end by first-party clients and runtime boundaries (no compatibility aliases or transport-time rename adapters in v1).
- [ ] Existing first-party transport implementations are refactored in this issue to canonical wire fields (including `context_snapshot.snapshot_id` and `session_end_marker.ended_at`/`reason`) rather than carrying legacy field names.
- [ ] Desktop transport drift is removed in this issue: replace legacy HTTP push assumptions with canonical shared Protocol emission semantics.
- [ ] `packages/api-contract/` public (JWT) and internal (shared-secret) surfaces are confirmed complete for v1: `GET /me`, `GET /agent`, `POST /consent`, `POST /sibling-invitation/skip`, `POST /devices/register`, `POST /internal/sessions/start`, `POST /internal/notifications/push`.
- [ ] Any shape needed by a planned issue but missing from the contract is added here, not in a deployable.
- [ ] Both packages typecheck and export stable types; consuming deployables import them without redefining shapes.

## Blocked by

None - can start immediately

## Unblocks

- #09
- #11
- #10

## Comments
