# Control Plane Development Runbook

**This is the canonical local development workflow for running the Control Plane on
your Mac.** It runs the real `src/main.ts` against an **isolated Neon dev branch** so
you can smoke-test identity, gates, routing, and device registration without
touching production.

Tag this doc and say **"run the control plane"** to start it, **"smoke the control
plane"** to hit the probes, or **"kill it"** to stop it — the [Agent operations](#agent-operations)
table below maps each to the exact commands.

This is the **modular** path: the Control Plane **alone**. To bring up all four
deployables together and walk the real user journey end-to-end, use the
[full local stack runbook](../../../docs/DEVELOPMENT.md) instead. For CI/verification
conventions see [`../../../docs/TESTING.md`](../../../docs/TESTING.md); for the
production release path see [`docs/RELEASE.md`](RELEASE.md) and
[`../../../docs/PRODUCTION.md`](../../../docs/PRODUCTION.md).

> **No production behavior changes for local dev.** The service reads the same
> config seam (`src/config/env.ts`) it reads in production. The local values point
> at an isolated Neon dev branch, loopback URLs, dummy internal secrets, and either
> real Neon Auth or the explicit `INTENTIVE_AUTH_MODE=local-dev` signed-token mode
> documented in the full local stack runbook.

---

## Agent operations

Run from the repo root. Config is read from the git-ignored `.env` (already
pre-filled for the `dev-local-smoke` branch; see [Configuration](#configuration)).

| You say…                      | Agent runs                                                                                                                                                                                                                     | What happens                                                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **"run the control plane"**   | `pnpm --filter "@intentive/control-plane..." run build` then `node --dns-result-order=ipv4first --no-network-family-autoselection --env-file=services/control-plane/.env services/control-plane/dist/main.js` (**background**) | Builds workspace deps + the service, boots Hono on `:8080` against the dev branch. The two IPv4 flags pin Neon traffic to IPv4 on IPv6-less networks (see [Gotchas](#gotchas-why-its-set-up-this-way)). |
| **"smoke the control plane"** | the three curls in [Smoke it](#smoke-it)                                                                                                                                                                                       | `/health` 200, `/ready` 200 (Neon + JWKS reachable), `/me` no-token → 401.                                                                                                                              |
| **"kill it"**                 | `lsof -ti tcp:8080 \| xargs kill -9`                                                                                                                                                                                           | Frees port 8080. No on-disk state to clean — the dev branch persists on Neon.                                                                                                                           |

> **Node 24's `--env-file` is how the `.env` reaches the process** — `pnpm start`
> (`node dist/main.js`) does **not** auto-load `.env` (the service never imports
> dotenv). Always launch with `node --env-file=…/.env …/dist/main.js`.

---

## Configuration

The local `.env` is git-ignored and **pre-filled** for the isolated Neon dev branch
`dev-local-smoke` (`br-shiny-firefly-aq66dcc4`), forked from production — writes to
it are copy-on-write and **never reach production**. The committed template is
[`.env.example`](../.env.example). The values that matter locally:

| Var                                                           | Local value                     | Why                                                                       |
| ------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------- |
| `PORT`                                                        | `8080`                          | HTTP surface clients + the internal endpoints listen on.                  |
| `NEON_DATABASE_URL`                                           | dev branch **pooled** string    | CP uses the Neon HTTP driver; pooled is fine.                             |
| `NEON_AUTH_JWKS_URL` / `_ISSUER` / `_AUDIENCE`                | the **real** Neon Auth instance | JWT verification. Not branched — same as production, safe to commit.      |
| `INTENTIVE_AUTH_MODE` / `INTENTIVE_DEV_AUTH_SECRET`           | optional `local-dev` pair       | Local signed JWTs for mocked-auth E2E; omit or set `neon` for real auth.  |
| `RUNTIME_INTERNAL_BASE_URL`                                   | `http://localhost:8081`         | Where `GET /agent` makes its Session Start call (Agent Runtime internal). |
| `INTERNAL_SECRET_TO_RUNTIME` / `INTERNAL_SECRET_FROM_RUNTIME` | dummy strings, **paired**       | Must match the Agent Runtime's `.env` (see its runbook).                  |

If you ever need the connection string again, fetch it for branch
`dev-local-smoke` from the Neon console or via the Neon MCP — never hard-code the
production branch here.

### Fresh / empty branch only

The dev branch already carries the `control_plane` schema (it was forked from
production). If you instead point `NEON_DATABASE_URL` at an **empty** branch, apply
the schema first:

```bash
pnpm --filter ./services/control-plane migrate   # creates control_plane schema + tables 0001–0005
```

---

## Smoke it

These prove the service is up and the auth boundary is engaged **without** needing a
valid user JWT or writing to the DB — the same three checks the production release
runbook uses:

```bash
curl -s localhost:8080/health        # → 200 {"ok":true,...}            (liveness)
curl -s localhost:8080/ready         # → 200 {"ready":true,"checks":{"neon":"ok","jwks":"ok"}}
curl -i -s localhost:8080/me         # → 401 (well-formed; proves the auth boundary)
```

> **Cold start:** the dev branch scales to zero immediately (`suspend_timeout_seconds: 0`),
> so the **first** `/ready` after the branch has been idle returns `503`
> (`neon: failed`) for ~2–3s while the compute wakes, then flips to `200`. That is
> the branch waking, not a misconfiguration — `health` (no DB) stays `200`
> throughout, and the first DB-backed request warms it.

To exercise the **authenticated** endpoints (`/me` with a real account, `/agent`,
gate writes), you need a real Neon Auth User JWT — the easiest way to get one is to
sign in through the Mobile Client. That is the [full local stack](../../../docs/DEVELOPMENT.md)
path. Note `GET /agent` calls the Agent Runtime's Session Start, so it returns a
retryable `503` unless the Agent Runtime is also running.

---

## The build ladder

From least to most production-like: `pnpm --filter ./services/control-plane test`
(unit + contract) → **this runbook (real service + isolated dev branch)** → the
[full local stack](../../../docs/DEVELOPMENT.md) (all four deployables, real
sign-in) → a no-traffic Cloud Run revision smoke ([`docs/RELEASE.md`](RELEASE.md)).

---

## Gotchas (why it's set up this way)

1. **`.env` is not auto-loaded.** Use `node --env-file=…` (Node ≥ 22; this repo is
   on 24). `pnpm start` boots with whatever is already in the environment.
2. **Auth is real, not faked.** Both servers verify real Neon Auth JWTs against the
   public JWKS. The Mobile Client's dev auth provider yields **no** server-valid
   token, and there is intentionally **no** server-side bypass — so isolated curl
   smoke is limited to `/health`, `/ready`, and the `401` boundary.
3. **Port 8080 is shared by intent.** The Control Plane keeps `8080`; the Agent
   Runtime moves its public WS to `8787` locally so the two don't collide.
4. **Never point at production.** The dev branch is isolated; keep
   `NEON_DATABASE_URL` on `dev-local-smoke` (or your own branch), never the
   production branch.
5. **No IPv6 on this Mac → pin Neon to IPv4.** Neon hosts are dual-stack, this
   machine has no IPv6 egress, and Node's Happy Eyeballs races the dead `AAAA`
   route — so `GET /me`/`GET /agent` (which read Neon via the serverless HTTP
   driver) intermittently `500` with `NeonDbError` → `fetch failed` →
   `AggregateError [ETIMEDOUT]`. Launch with `--dns-result-order=ipv4first
--no-network-family-autoselection` (the standalone command above and
   `scripts/local-stack.sh` already do); the `ipv4first` reorder alone is not enough.
