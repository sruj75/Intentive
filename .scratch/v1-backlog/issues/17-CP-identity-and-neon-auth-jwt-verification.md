# Phase 1: Identity And Neon Auth JWT Verification

Status: ready-for-agent
Labels: ready-for-agent
Deployable: control-plane
Opened: 2026-05-28T12:00:00Z
Updated: 2026-05-28T12:00:00Z

## Description

## Parent

.scratch/v1-backlog/prds/control-plane-PRD.md

## What to build

Implement the `identity` domain: resolve a **User** from a Neon Auth JWT on every authenticated public request, using the shared `packages/providers/` auth boundary (JWKS verification). This is the foundation every other public endpoint sits on.

## Acceptance criteria

- [ ] User JWTs are verified through the shared Providers auth interface (`packages/providers/auth`), not a Control Plane-local verifier.
- [ ] Signature, expiry, issuer, and audience are all validated; token-verification failures return structured `401 auth_failed` responses without leaking token contents.
- [ ] Transient JWKS transport/availability failures return structured `503 service_unavailable` responses without leaking token or provider internals.
- [ ] A verified request exposes a typed principal (`{ user_id }`) to downstream domains.
- [ ] First sign-in creates the User record in the control-plane-owned Neon schema; repeat sign-in resolves the existing User idempotently.
- [ ] Google is the only identity provider wired in v1; the verifier config leaves room for Apple later without code changes to callers.
- [ ] Tests cover valid token, expired token, wrong issuer/audience, malformed token, JWKS-unavailable outage behavior, and first-vs-repeat User resolution.

## Blocked by

- #11
- #09

## Unblocks

- #20
- #21
- #24

## Comments
