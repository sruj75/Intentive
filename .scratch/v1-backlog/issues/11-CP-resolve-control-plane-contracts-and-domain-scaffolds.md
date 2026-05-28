# Phase 0: Resolve Control Plane Contracts And Domain Scaffolds

Status: ready-for-agent
Labels: ready-for-agent
Deployable: control-plane
Opened: 2026-05-28T12:00:00Z
Updated: 2026-05-28T12:00:00Z

## Description

## Parent

.scratch/v1-backlog/prds/control-plane-PRD.md

## What to build

Align the Control Plane planning contracts and establish the module seams before behavior. The `packages/api-contract/` surface, the six domain modules, the Neon schema ownership boundary, and the Internal API shared-secret configuration should all agree before any endpoint is implemented.

## Acceptance criteria

- [ ] The six domains (`identity`, `devices`, `gates`, `agents`, `routing`, `notifications`) exist as scaffolded modules under `src/domains/<name>/{types,config,repo,service,runtime,ui}/` per the layer rule.
- [ ] The public and internal endpoint surfaces in `packages/api-contract/` are checked against `services/control-plane/AGENTS.md` and `docs/CONTEXT.md` vocabulary; any drift is reconciled in `packages/api-contract/` first.
- [ ] The control-plane-owned Neon schema is documented as a separate role/schema from the Agent Runtime's, with no shared tables.
- [ ] The Internal API trust model (shared secret in `Authorization: Bearer` on a private interface) is documented and configurable, matching what the Agent Runtime's `internal` module expects.
- [ ] The shared-secret and JWT-minting configuration is enumerated (issuer, audience, runtime JWT signing key, Neon Auth JWKS URL) without committing secrets.

## Blocked by

- #08

## Unblocks

- #17
- #20
- #21

## Comments
