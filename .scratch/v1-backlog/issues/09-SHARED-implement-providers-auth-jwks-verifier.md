# Phase 1: Implement Providers Auth (Neon Auth JWKS Verifier)

Status: ready-for-agent
Labels: ready-for-agent
Deployable: shared
Opened: 2026-05-28T12:00:00Z
Updated: 2026-05-28T12:00:00Z

## Description

## Parent

.scratch/v1-backlog/prds/shared-contracts-PRD.md

## What to build

Replace the stub in `packages/providers/src/auth.ts` (which currently throws "Not implemented") with a real Neon Auth JWKS verifier. Both the Control Plane (`identity` domain) and the Agent Runtime (WebSocket gateway) verify user JWTs through this one boundary, so it is a hard blocker for Control Plane #17 and Agent Runtime #19.

## Acceptance criteria

- [ ] `createJwtVerifier({ jwks_url, issuer, audience })` returns a working `JwtVerifier`; `verify(token)` resolves a typed `VerifiedPrincipal` (`{ user_id }`) for valid tokens.
- [ ] JWKS keys are fetched and cached, with key rotation handled (refetch on unknown `kid`).
- [ ] Signature, expiry, issuer, and audience are all validated; each failure mode throws a distinguishable, typed error (not a generic Error).
- [ ] No token contents or secrets are logged by the verifier.
- [ ] The interface stays stable enough that the Control Plane and Agent Runtime consume it identically.
- [ ] Tests cover valid token, expired token, wrong issuer, wrong audience, unknown `kid` triggering refetch, and malformed token, against a fake JWKS endpoint.

## Blocked by

- #08

## Unblocks

- #17
- #19

## Comments
