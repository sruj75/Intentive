# Agent Runtime Development Runbook

**This is the canonical local development workflow for running the Agent Runtime on
your Mac.** It runs the real `src/main.ts` — WebSocket gateway, DeepAgents turn
spine, cron + heartbeat loops, internal Session Start — against an **isolated Neon
dev branch**, so you can smoke-test live Companion behavior without touching
production.

Tag this doc and say **"run the agent runtime"** to start it, **"smoke the agent
runtime"** to hit the health probe, or **"kill it"** to stop it — the
[Agent operations](#agent-operations) table maps each to the exact commands.

This is the **modular** path: the Agent Runtime **alone**. To bring up all four
deployables together and walk the real user journey (the live `user_message` →
companion reply turn), use the [full local stack runbook](../../../docs/DEVELOPMENT.md).
For CI/verification see [`../../../docs/TESTING.md`](../../../docs/TESTING.md); for
the production release path see [`docs/RELEASE.md`](RELEASE.md) and
[`../../../docs/PRODUCTION.md`](../../../docs/PRODUCTION.md).

> **No production behavior changes for local dev.** Same config seam
> (`src/config/env.ts`) as production; local values point at an isolated Neon dev
> branch, loopback URLs, dummy internal secrets, your own OpenRouter key, and
> either real Neon Auth or the explicit `INTENTIVE_AUTH_MODE=local-dev` signed-token
> mode documented in the full local stack runbook.

---

## Agent operations

Run from the repo root. Config is read from the git-ignored `.env` (pre-filled for
the `dev-local-smoke` branch; **you must set a real `OPENROUTER_API_KEY`** — see
[Configuration](#configuration)).

| You say…                      | Agent runs                                                                                                                                                      | What happens                                                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **"run the agent runtime"**   | `pnpm --filter "@intentive/agent-runtime..." run build` then `node --env-file=services/agent-runtime/.env services/agent-runtime/dist/main.js` (**background**) | Builds deps + service, boots the WS server on `:8787`, the internal API on `:8081`, and starts the cron + heartbeat poll loops. |
| **"smoke the agent runtime"** | `curl -s localhost:8081/health`                                                                                                                                 | `200 {"ok":true,"service":"agent-runtime"}`. The live WS turn needs a real JWT — see below.                                     |
| **"kill it"**                 | `lsof -ti tcp:8787 tcp:8081 \| xargs kill -9`                                                                                                                   | Frees both ports. No on-disk state — the dev branch persists on Neon.                                                           |

> **Use Node 24's `--env-file`** — `pnpm start` does not auto-load `.env` (the
> service never imports dotenv).

---

## Configuration

The local `.env` is git-ignored and pre-filled for the isolated Neon dev branch
`dev-local-smoke` (`br-shiny-firefly-aq66dcc4`), forked from production — writes are
copy-on-write and **never reach production**. Committed template:
[`.env.example`](../.env.example). What matters locally:

| Var                                                           | Local value                               | Why                                                                                                          |
| ------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `OPENROUTER_API_KEY`                                          | **your real key** (the one thing to fill) | Required — the companion reply runs through OpenRouter (`RUNTIME_MODEL` default is free).                    |
| `PORT` / `INTERNAL_PORT`                                      | `8787` / `8081`                           | Public WS / private internal HTTP. WS moves off 8080 so it doesn't collide with CP.                          |
| `PUBLIC_WS_URL`                                               | `ws://localhost:8787/ws`                  | What the Control Plane hands clients in `GET /agent`; must be loopback-reachable.                            |
| `NEON_DATABASE_URL`                                           | dev branch connection string              | Runtime-owned schema. On this Mac, the local stack uses the Neon pooler host for more reliable local egress. |
| `CONTROL_PLANE_INTERNAL_BASE_URL`                             | `http://localhost:8080`                   | Where Post-Message-Back pushes to the Control Plane.                                                         |
| `INTERNAL_SECRET_FROM_CONTROL_PLANE` / `..._TO_CONTROL_PLANE` | dummy, **paired**                         | Must match the Control Plane's `.env` (see its runbook).                                                     |
| `NEON_AUTH_JWKS_URL` / `_ISSUER` / `_AUDIENCE`                | the **real** Neon Auth instance           | Local client-JWT verification, same as production.                                                           |
| `INTENTIVE_AUTH_MODE` / `INTENTIVE_DEV_AUTH_SECRET`           | optional `local-dev` pair                 | Local signed JWTs for mocked-auth E2E; omit or set `neon` for real auth.                                     |

### Database setup

The dev branch already carries the `agent_runtime` schema **and** the LangGraph
store/checkpoint tables (it was forked from production), so it boots as-is. On
**boot**, `PostgresStore.setup()` and the checkpointer setup re-ensure the LangGraph
tables either way. If you instead point at an **empty** branch, apply the domain SQL
first:

```bash
pnpm --filter ./services/agent-runtime migrate   # creates agent_runtime schema + tables 0001–0009
```

(The boot-time `.setup()` then adds the LangGraph store/checkpoint tables — which is
why the role needs `CREATE` on the schema. With the dev branch's owner role that's
already satisfied.)

---

## Smoke it

```bash
curl -s localhost:8081/health        # → 200 {"ok":true,"service":"agent-runtime"}
```

Watch the startup log for the **cron** and **heartbeat** schedulers reporting
"started" (both poll Neon every 60s). The thing that actually breaks in this service
is the **live conversation**, and that needs a real client connecting over WS with a
verified JWT — i.e. the [full local stack](../../../docs/DEVELOPMENT.md): a client
completes the WS handshake → `connect` returns a snapshot → a `user_message` gets a
**companion reply** (which proves the WS gateway + Neon + OpenRouter + the turn
spine together). There is no useful unauthenticated curl for the WS turn.

---

## The build ladder

From least to most production-like: `pnpm --filter ./services/agent-runtime test`
(unit + domain) → **this runbook (real service + isolated dev branch)** → the
[full local stack](../../../docs/DEVELOPMENT.md) (real sign-in, live turn) → an
in-place VM swap smoke ([`docs/RELEASE.md`](RELEASE.md)).

---

## Gotchas (why it's set up this way)

1. **`OPENROUTER_API_KEY` is mandatory** and is the one secret not pre-filled —
   `loadConfig` fails fast at boot without it, and no companion reply is possible
   without it. The `local-stack.sh` launcher refuses to start until you replace the
   placeholder.
2. **Direct (non-pooled) Neon URL only.** A `-pooler` host will break LangGraph's
   prepared statements. The dev branch's direct host is already in `.env`.
3. **`.env` is not auto-loaded.** Launch with `node --env-file=…` (Node ≥ 22).
4. **Auth is real, not faked.** The WS gateway verifies real Neon Auth JWTs locally
   against the public JWKS; the Mobile dev auth provider yields no server-valid
   token. There is intentionally no server bypass — exercise the live turn through a
   real sign-in.
5. **Ports.** Public WS `8787`, internal `8081`; the Control Plane owns `8080`.
