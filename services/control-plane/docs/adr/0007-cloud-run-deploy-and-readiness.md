# Cloud Run deploy promotes a no-traffic revision gated by a deep readiness probe

Status: accepted

The Control Plane (#50) deploys to Google Cloud Run as a **single production environment** — there is no separate staging service. Safety against a bad deploy comes from **no-traffic revision promotion**, not from a parallel environment: each deploy lands as a Cloud Run revision that receives **zero traffic**, is smoke-tested at its own revision URL, and is promoted to live traffic only if the smoke check passes. Auto-deploy-on-push (`DEPLOY_ENABLED=true`) is turned on **only after** a manual `workflow_dispatch` deploy has gone green end to end.

The smoke check targets a **deep readiness probe**, not the shallow liveness probe. `GET /healthz` stays a dumb liveness check (process up; Cloud Run uses it to restart crashed instances). A new `GET /readyz` performs a _real_ dependency check — a `SELECT 1` against Neon and a fetch of the Neon Auth JWKS — and returns 200 only when both succeed. The deploy smoke check calls `/readyz`, so "green" means "this revision can actually reach the things it needs," catching a deploy that boots but cannot reach the database or the auth keys.

## Considered Options

- **No-traffic revision promotion gated by `/readyz` (chosen).** Gives "new code proves itself before users see it" (the row-7 failure: a deploy ships broken code) without the cost of a second Neon database, a second Cloud Run service, and a second secret set. Neon's HTTP driver already removes the connection-exhaustion risk that a separate environment would otherwise help isolate.
- **Full staging environment (separate Cloud Run service + Neon branch).** Rejected for v1: real isolation, but doubles the deploy surface and secret management for a pre-launch, single-operator system. Revertible later — a staging Neon branch is cheap to add when there is a team or a release cadence that needs it.
- **Prod-only with immediate traffic (no readiness gate).** Rejected: this is Job A ("make it deploy"), not production readiness. A boot-but-can't-reach-Neon deploy would be discovered by users.
- **Smoke-test the authenticated endpoints (`/me`, `/agent`, `/devices/register`) against prod.** Rejected: each needs a real Neon Auth user JWT, `/agent` would fire a live Session Start, and `/devices/register` would write a junk row into the production database on every deploy. `/readyz` proves the two things that actually break (Neon + JWKS); route wiring is already covered by the test suite against ephemeral Neon branches (ADR-0003).

## Consequences

- A new `GET /readyz` handler lives in the identity `ui` layer beside `/healthz`; it must fail fast (short timeout) and must not become an unauthenticated "ping my database" amplifier.
- The Session Start client (`agents/repo/runtime-session-start.ts`) gains a request **timeout** (AbortController). Without it, a _hung_ (not down) Agent Runtime makes `GET /agent` wait indefinitely and ties up Cloud Run request slots — turning a contained dependency failure (row 3) into a Control-Plane-wide outage (row 6). The timeout collapses a hung Runtime into the existing `AgentRuntimeUnavailableError → 503` path; a `Retry-After` header on that 503 is an optional nicety.
- Structured logging emits **domain events** (JWT verification outcomes, gate transitions, Session Start calls, device registrations, push fan-out results) through the `packages/providers` telemetry boundary with redaction (no tokens, push tokens, device fingerprints, or shared secrets). It does **not** duplicate the per-request logs Cloud Run already emits at the edge.
- The container is a multi-stage, pnpm-workspace-aware Dockerfile with a distroless run stage (or `node:22-slim` fallback), a non-root user, and `PORT` honored from the environment (already read by `config/env.ts`).
- The deploy workflow keeps its `DEPLOY_ENABLED` variable gate plus `workflow_dispatch`; the f40df67 secret-check skip is already superseded and needs no further "re-enable" work.
- Scale (row 6) needs no special pooling work: the Control Plane uses Neon's HTTP `neon()` driver, which opens no persistent connections, so Cloud Run autoscaling cannot exhaust database connections. `NEON_DATABASE_URL` uses Neon's pooled connection string as the safe default, and Neon compute autoscaling stays on.
