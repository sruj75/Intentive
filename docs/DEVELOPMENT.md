# Full Local Stack Development Runbook

**Run all four deployables together on your Mac and walk the real user journey
end-to-end** — cold launch → sign-in → Pre-Chat Gates → chat → a live companion
reply, plus desktop capture and proactive message-backs. This is the meta runbook;
it composes the four per-deployable runbooks into one stack so you can **evaluate and
approve the user journey** locally before anything ships.

Want to run just **one** piece in isolation instead? Each deployable has its own
runbook:

| Deployable     | Modular runbook                                                                               |
| -------------- | --------------------------------------------------------------------------------------------- |
| Control Plane  | [`services/control-plane/docs/DEVELOPMENT.md`](../services/control-plane/docs/DEVELOPMENT.md) |
| Agent Runtime  | [`services/agent-runtime/docs/DEVELOPMENT.md`](../services/agent-runtime/docs/DEVELOPMENT.md) |
| Mobile Client  | [`apps/mobile/docs/DEVELOPMENT.md`](../apps/mobile/docs/DEVELOPMENT.md)                       |
| Desktop Client | [`apps/desktop/docs/DEVELOPMENT.md`](../apps/desktop/docs/DEVELOPMENT.md)                     |

> **This changes no production behavior.** Every deployable boots from the same config
> seam it uses in production; local-only values differ — an **isolated Neon dev
> branch** instead of production, loopback URLs, dummy internal secrets, and your
> own OpenRouter key. Auth can run in either real Neon Auth mode or the explicit
> `local-dev` signed-token mode. `local-dev` still verifies a real JWT signature
> with the same issuer/audience/subject contract; it just uses a local HS256
> signing secret instead of the Neon JWKS endpoint.

---

## Two ways to exercise the stack (both are "development")

Development is the **code → run → verify** loop, and there are two ways to drive the
running stack. They are not rivals — they are the iterate phase and the final-check
phase of the same workflow, the same way you write code and then test it.

1. **Interactive loop — with the simulator.** Bring the backend up once
   (`scripts/local-stack.sh`), then iterate on a client and watch real behavior:
   edit code → reload the **iOS simulator** (and optionally the Desktop app) → tap
   through sign-in → gates → chat → companion reply → repeat. You leave the two
   backend services running and keep reloading the client. **Here _you_ are the
   test** — the simulator is how you drive requests and eyeball the result. This is
   where you spend most of your day. ([The user journey to approve](#the-user-journey-to-approve)
   is the script to walk.)

2. **Final check — the headless smoke.** When the loop looks good, run
   `scripts/local-backend-e2e.mjs` ([Backend E2E without Google sign-in](#backend-e2e-without-google-sign-in)).
   **No simulator** — a script mints a local token and drives one `user_message` →
   `companion_message` straight over HTTP/WS, so the backend path is proven
   automatically and repeatably. This is the "now run the test" at the end of the day.

Crucially, **both modes hit the exact same stack** — local Control Plane → local
Agent Runtime → the same isolated Neon dev branch → the same OpenRouter model. The
only thing that changes is _who sends the request_: you through the simulator, or the
script headlessly. So a green smoke and a good hands-on session are testing the same
wiring from two angles.

---

## How the four wire together locally

```
Mobile (iOS sim) ──HTTP──> Control Plane :8080 ──HTTP /internal/sessions/start──> Agent Runtime :8081 (internal)
   │  GET /me, /agent, /consent, /devices/register                                        ▲
   └──────────────────── WS ws://localhost:8787/ws ─────────────────────────────> Agent Runtime :8787 (public WS)
                                                                                          │
Desktop (Mac, optional) ──HTTP /agent──> CP ; ──WS──> Agent Runtime (context_snapshot)    │
Agent Runtime ──HTTP /internal/notifications/push──> Control Plane ──> Expo Push ──> Mobile
```

| Port | Who                              |
| ---- | -------------------------------- |
| 8080 | Control Plane (HTTP)             |
| 8787 | Agent Runtime — public WebSocket |
| 8081 | Agent Runtime — internal HTTP    |

The paired internal secrets and the Neon dev branch are already wired across the two
services' git-ignored `.env` files. The **database** is one isolated Neon branch,
`dev-local-smoke` (`br-shiny-firefly-aq66dcc4`), forked from production — copy-on-write,
so nothing you do locally can affect production.

---

## Prerequisites (one-time)

1. **OpenRouter key.** Put a real key in `services/agent-runtime/.env`
   (`OPENROUTER_API_KEY=`). It is the one secret not pre-filled, and the only thing
   the launcher requires you to set. (A free `RUNTIME_MODEL` is the default.)
2. **Local mocked auth, if you do not want Google sign-in.** In both
   `services/control-plane/.env` and `services/agent-runtime/.env`, set the same
   local-only values:

   ```bash
   INTENTIVE_AUTH_MODE=local-dev
   INTENTIVE_DEV_AUTH_SECRET=<at-least-32-local-only-characters>
   ```

   Then mint a bearer token when you need one:

   ```bash
   scripts/local-dev-auth-token.mjs --user-id local-dev-user
   ```

   The token is accepted by both server deployables only in `local-dev` mode.

3. **A booted iOS simulator + a Mobile dev build.** Follow
   [`apps/mobile/docs/DEVELOPMENT.md`](../apps/mobile/docs/DEVELOPMENT.md) once to
   install the dev client.
4. _(Optional)_ **Desktop**, if you want to exercise capture →
   [`apps/desktop/docs/DEVELOPMENT.md`](../apps/desktop/docs/DEVELOPMENT.md).

The two services' `.env` files are pre-generated; if either is missing, copy from
its `.env.example` (the modular runbooks list every value).

---

## Bring up the stack — one command

```bash
scripts/local-stack.sh            # build + start Control Plane + Agent Runtime, wait for health, tail logs
```

It builds both services (and their workspace deps), starts the Control Plane on
`:8080` and the Agent Runtime on `:8787`/`:8081`, waits until both `/health` probes
pass, prints the wiring, then tails both logs. **Ctrl-C stops everything** (it's
self-cleaning). To stop a stack started elsewhere:

```bash
scripts/local-stack.sh --down     # free :8080, :8787, :8081 (idempotent)
```

> The script owns the **two server deployables** — the always-on backend half. The
> clients are launched from their own runbooks (simulator / Tauri) and pointed at
> `:8080`, because each needs its own device/sim toolchain.

### Then point the clients at the local Control Plane

- **Mobile:** in `apps/mobile/.env` set
  `EXPO_PUBLIC_CONTROL_PLANE_BASE_URL=http://localhost:8080`, then run the Mobile
  dev client per its runbook. (Blank = offline dev fixtures; the URL is what flips it
  to the real local stack. The iOS simulator shares the Mac's network, so `localhost`
  resolves; a **physical** device needs your Mac's LAN IP instead.)
- **Desktop (optional):** set `INTENTIVE_CONTROL_PLANE_URL=http://localhost:8080`
  before launching, then run it per its runbook.

---

## The user journey to approve

With the stack up and the Mobile dev client pointed at `:8080`, walk it and confirm
each step. This is the end-to-end product loop the local stack exists to evaluate:

1. **Cold launch → Get Started → Identity Gate.** Sign in with Google, or use the local signed
   JWT path for server/backend E2E. → a server-valid User JWT now flows on every
   request.
2. **`GET /me` resolves gates.** Consent Primer (Data & Privacy) → Onboarding funnel →
   Sibling Invitation → Free Trial appear in resolver order; shared gates write
   cross-client state on the Control Plane when completed (watch the Control Plane log).
   Onboarding and Free Trial are client-resolved until the Control Plane contract extends.
3. **Enter chat → `GET /agent`.** The Control Plane enforces the gates, runs Session
   Start against the Agent Runtime (`:8081`), and returns the WS URL + pass-through
   JWT. A `403` means a gate is unsatisfied; a `503` means the Runtime wasn't
   reachable.
4. **WebSocket connect.** The client dials `ws://localhost:8787/ws`; `connect`
   returns a Session Snapshot (empty history on a fresh user).
5. **`user_message` → companion reply.** Send a message; a reply streams back. This
   is the money shot — it proves WS gateway + Neon + OpenRouter + the turn spine end
   to end.
6. _(Optional, Desktop)_ **Capture → `context_snapshot`.** With capture readiness
   granted, the desktop heartbeat emits snapshots over its own WS session.
7. _(Optional, proactive)_ **Cron / Heartbeat → Post-Message-Back.** The Runtime's
   poll loops can drive a proactive message; delivery to a real device additionally
   needs an Expo push token (`EXPO_ACCESS_TOKEN` in the CP `.env`) — otherwise the
   in-session delivery path still works.

Watching the two tailed logs as you go is the fastest way to see exactly where a step
lands (or stalls).

---

## Teardown

```bash
scripts/local-stack.sh --down                       # stop both services, free their ports
```

Then stop the clients via their own runbooks ("kill it" in the Mobile / Desktop
docs). Nothing local persists except the Neon dev branch, which is meant to stick
around; delete it from the Neon console / MCP if you want a clean slate.

---

## Gotchas

1. **OpenRouter key is required** — the launcher refuses to start until you replace
   the placeholder in the Agent Runtime `.env`.
2. **Auth is still verified.** `local-dev` is mocked identity, not no-auth. Both
   services must share the same `INTENTIVE_DEV_AUTH_SECRET`, and the token must
   have the configured issuer and audience.
3. **`localhost` works on the simulator, not on a physical phone.** Use the Mac's LAN
   IP (and the same for `PUBLIC_WS_URL` if you test on-device).
4. **Port discipline:** CP `8080`, Runtime WS `8787`, Runtime internal `8081`. If a
   start fails on "address in use," run `scripts/local-stack.sh --down` first.
5. **First request is slow (cold start).** The dev branch scales to zero
   immediately, so the first DB-backed call after idle takes ~2–3s while it wakes;
   `local-stack.sh` waits on the Control Plane's `/ready` (which warms it) before
   declaring the stack up, so by the time you start the clients the branch is awake.
6. **Production is untouchable from here.** The stack only ever talks to the isolated
   `dev-local-smoke` branch; keep it that way — never repoint a `.env` at the
   production branch.
7. **No IPv6 on this Mac → force IPv4 to Neon.** Neon hosts are dual-stack (publish
   both IPv4 `A` and IPv6 `AAAA` records). This machine has **no IPv6 egress**, so
   Node's Happy Eyeballs (`autoSelectFamily`) keeps racing the dead IPv6 route, and
   stalls surface intermittently as `EHOSTUNREACH`/`ETIMEDOUT` → `AggregateError`
   (empty message) → `NeonDbError` — which can kill a turn _after_ the model replies,
   so no `companion_message` lands. `scripts/local-stack.sh` already exports
   `NODE_OPTIONS=--dns-result-order=ipv4first --no-network-family-autoselection`
   to pin both services to IPv4 (the `ipv4first` reorder alone is **not** enough —
   `--no-network-family-autoselection` is what stops the IPv6 race). If you launch a
   service **standalone** (per its modular runbook) on this network, use the same two
   flags. The runtime also retries transient Neon connection errors on the turn write
   path, so a single blip no longer drops a reply — but avoiding the blip is cheaper.

## Backend E2E without Google sign-in

With `scripts/local-stack.sh` running and both services set to
`INTENTIVE_AUTH_MODE=local-dev`, run:

```bash
scripts/local-backend-e2e.mjs
```

It mints a short-lived local JWT, clears the two mobile gates, calls `GET /agent`,
opens the Runtime WebSocket, sends one `user_message`, and waits for one
`companion_message`.
