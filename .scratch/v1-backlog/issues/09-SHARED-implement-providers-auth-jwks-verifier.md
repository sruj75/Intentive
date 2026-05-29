# Phase 1: Implement Providers Auth (Neon Auth JWKS Verifier)

Status: closed
Labels: closed
Deployable: shared
Opened: 2026-05-28T12:00:00Z
Updated: 2026-05-28T12:00:00Z

## Description

## Parent

.scratch/v1-backlog/prds/shared-contracts-PRD.md

## What to build

Replace the stub in `packages/providers/src/auth.ts` (which currently throws "Not implemented") with a real Neon Auth JWKS verifier. Both the Control Plane (`identity` domain) and the Agent Runtime (WebSocket gateway) verify user JWTs through this one boundary, so it is a hard blocker for Control Plane #17 and Agent Runtime #19.

## Acceptance criteria

- [x] `createJwtVerifier({ jwks_url, issuer, audience })` returns a working `JwtVerifier`; `verify(token)` resolves a typed `VerifiedPrincipal` (`{ user_id }` from the `sub` claim) for valid tokens.
- [x] JWKS keys are fetched and cached, with key rotation handled (refetch on unknown `kid`) via jose's `createRemoteJWKSet`.
- [x] Signature, expiry, issuer, and audience are all validated; each failure throws a typed `JwtVerificationError` with a `reason` discriminant (`expired`/`invalid_signature`/`wrong_issuer`/`wrong_audience`/`unknown_key`/`malformed`).
- [x] No token contents or secrets are logged by the verifier; error messages carry only the reason (covered by a privacy test).
- [x] The interface is unchanged; a backward-compatible optional `{ cooldownDurationMs }` 2nd arg exists for test determinism and is ignored by CP/AR.
- [x] Tests cover valid token, expired, wrong issuer, wrong audience, invalid signature, unknown `kid`, unknown `kid` triggering a refetch that picks up a rotated key, and malformed token, against a fake JWKS endpoint (`packages/providers/test/auth.test.mjs`).

## Blocked by

- #08

## Unblocks

- #17
- #19

## Comments
