# Phase 2: Pre-Chat Gate State And GET /me

Status: ready-for-agent
Labels: ready-for-agent
Deployable: control-plane
Opened: 2026-05-28T12:00:00Z
Updated: 2026-05-28T12:00:00Z

## Description

## Parent

.scratch/v1-backlog/prds/control-plane-PRD.md

## What to build

Implement the `gates` domain and the `GET /me` endpoint that returns **Account State** plus the next **Pre-Chat Gate** for the calling Client, plus the write endpoints that record cross-client gate completion. This is what Mobile's Entry Resolver (#12), Consent Primer (#14), and Desktop's gate sequence consume.

## Acceptance criteria

- [ ] `GET /me` returns the `AccountState` shape from `packages/api-contract/` (`user_id`, `next_gate`, `has_agent_instance`).
- [ ] The next gate is computed from `client_kind` plus cross-client state: Mobile sequence is Identity → Consent Primer → Sibling Client Invitation (skippable); Desktop sequence adds Capture Permission Setup as a Device-Local Gate.
- [ ] Cross-Client Gates (Identity, Consent Primer, Sibling Invitation skip) completed on any device are recorded once and not re-prompted on a sibling Client of the same User.
- [ ] Device-Local Gates (Capture Permission Setup) are not satisfied by another device's completion.
- [ ] `POST /consent` records Consent Primer completion (cross-client) and is idempotent.
- [ ] `POST /sibling-invitation/skip` records the skip (cross-client) and is idempotent.
- [ ] Device-specific permissions (e.g. iPhone notifications) are never modeled as shared relationship consent.
- [ ] Tests cover each gate-sequence outcome, cross-client suppression, device-local non-suppression, and idempotent re-POST.

## Blocked by

- #17

## Unblocks

- #24

## Comments
