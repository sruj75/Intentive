# Phase 5: Cloud Run Deploy And Production Readiness

Status: ready-for-agent
Labels: ready-for-agent
Deployable: control-plane
Opened: 2026-05-28T12:00:00Z
Updated: 2026-05-28T12:00:00Z

## Description

## Parent

.scratch/v1-backlog/prds/control-plane-PRD.md

## What to build

Make the Control Plane deployable to **Google Cloud Run** with the configuration the rest of the system assumes: Neon connection, Neon Auth JWKS, runtime JWT signing key, the Internal API shared secret, and APNs credentials. Re-enable the deploy workflow that was skipped pending GitHub secrets (commit `f40df67`).

## Acceptance criteria

- [ ] A Dockerized build runs the Control Plane statelessly and passes a `/health` (or equivalent) check.
- [ ] All configuration is read from environment/secret references: Neon URL + role, Neon Auth JWKS URL, issuer/audience, runtime JWT signing key, Internal API shared secret, APNs credentials.
- [ ] The `control-plane-deploy` GitHub workflow builds, pushes to Artifact Registry, and runs `gcloud run deploy`, gated on the required GitHub secrets being present.
- [ ] Structured logging goes through the shared `packages/providers/` telemetry boundary with no secrets or tokens in log fields.
- [ ] The deploy is documented in `services/control-plane/README.md` including the secret inventory required for a green deploy.
- [ ] A documented smoke check exercises `GET /me`, `GET /agent`, and `POST /devices/register` against a deployed instance.

## Blocked by

- #24
- #43
- #45

## Comments
