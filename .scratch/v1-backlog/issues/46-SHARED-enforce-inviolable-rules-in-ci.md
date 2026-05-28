# Phase 2: Enforce Inviolable Rules In CI

Status: ready-for-agent
Labels: ready-for-agent
Deployable: shared
Opened: 2026-05-28T12:00:00Z
Updated: 2026-05-28T12:00:00Z

## Description

## Parent

.scratch/v1-backlog/prds/shared-contracts-PRD.md

## What to build

Make the five inviolable rules in the root `AGENTS.md` enforced by the custom linters in `tools/linters/` (run in CI on every PR, per `docs/ARCHITECTURE.md` → "Mechanical enforcement") rather than by convention, and keep `packages/domain-types/` aligned with the locked contracts. This is what prevents the boundaries from rotting as the Control Plane, Agent Runtime, and Clients fill in. Per the Harness Engineering pattern, each lint error message should inject the remediation instruction (the canonical term / correct import) into agent context.

## Acceptance criteria

- [ ] Layer direction (`types → config → repo → service → runtime → ui`) is enforced; backward imports fail CI.
- [ ] No cross-deployable imports: `apps/mobile/**` cannot import `apps/desktop/**` or `services/**`, and vice versa; violations fail CI.
- [ ] Cross-cutting concerns (auth, telemetry, flags) imported anywhere except via `packages/providers/` (or a domain's sanctioned re-export) fail CI.
- [ ] `docs/CONTEXT.md` `_Avoid_` terms appearing in source fail lint, surfacing the canonical term.
- [ ] A single `packages/protocol/` version is enforced across the monorepo; stale imports fail typecheck.
- [ ] `packages/domain-types/` shapes (branded ids, `Device`, `AgentInstance`, `ConversationMessage`) are reconciled against the locked `protocol`/`api-contract` surfaces with no wire-format leakage.
- [ ] CI runs these checks on every PR and the rules are referenced from `AGENTS.md`.

## Blocked by

- #08

## Comments
