# Signed-in Capture Session smoke

A demoable, repeatable smoke that proves **one unbroken chain** on a signed-in
Mac:

> Routing from the Control Plane (real Neon-Auth-shaped JWT verification) →
> capture auto-starts when Desktop Capture Readiness is true → **real ScreenPipe**
> captures → the Context Heartbeat produces a sanitized Context Snapshot →
> written to the Snapshot Store **before** delivery → emitted as a
> `context_snapshot` Protocol event to a controlled gateway → Stop emits a
> `session_end_marker` **before** ScreenPipe shutdown (ADR-0022) → menu bar
> reflects Capturing → Stopped.

Every component is proven in isolation elsewhere (ScreenPipe lifecycle #10,
heartbeat→snapshot #13, permissions #32, the emit serializer locked to
`@intentive/protocol` #34, gateway ingest #28). **This smoke's job is to prove
the joints hold when the thing is assembled live and signed-in.** The real joints
stay real (real ScreenPipe spawn, the real FSM/scheduler/emit path, real
`GET /agent` over HTTP); only the _edges_ (Control Plane, gateway, summarizer
cadence) are made deterministic.

It is **not** the packaged-app smoke (#55), DMG/signing (#53/#54), the
reliability+privacy harness (#43), or AR runtime snapshot semantics (#38/#40).

## Prerequisites — read before running

1. **A signed-in Mac with all three macOS grants** — Screen Recording,
   Microphone, Accessibility (Desktop Capture Readiness true). Capture is gated
   on sign-in **+** local readiness (ADR-0020), and that gate is device-local: it
   **cannot** be automated. Without the grants, capture parks in `SetupRequired`
   and the smoke times out waiting for snapshots.
2. **Apple Silicon** (V1 only) with the bundled ScreenPipe resource present
   (`src-tauri/resources/screenpipe`).
3. Node + pnpm ≥ 11. The harness is the workspace package
   `@intentive/desktop-smoke` under `apps/desktop/smoke/`.

## Run it

```bash
pnpm --filter ./apps/desktop smoke      # convenience alias
# or directly:
node apps/desktop/smoke/run-smoke.mjs
```

What the orchestrator does:

1. Builds `@intentive/protocol` and `@intentive/providers` (so the `.mjs`
   imports resolve to `dist/`).
2. Starts the **gateway** (`gateway.mjs`) on an ephemeral port — does the real
   `connect → hello_ok` handshake, validates every inbound frame with the real
   `@intentive/protocol` parser, and records receipts to
   `apps/desktop/smoke/.out/receipts.jsonl`.
3. Starts the **Control Plane stub** (`control-plane.mjs`) — mints an ephemeral
   RSA keypair, serves its JWKS, and validates the `Authorization: Bearer` login
   token with the **real** `createJwtVerifier` from `@intentive/providers/auth`.
   A valid token → `200` routing pointing at the gateway; invalid → `401`.
4. Mints a login JWT, exports the dev-only env (below), and launches the **real**
   Desktop app with `tauri dev` (real ScreenPipe boots).
5. Waits AFK for ≥2 heartbeat cycles to arrive as gateway receipts.
6. **You then toggle capture OFF in the menu bar** (Capturing → Stopped). This is
   the one manual step — it is the same device-local action the grants gate
   implies, and doubles as the demo. It emits the `session_end_marker`.
7. Correlates evidence (`assert.mjs`) and prints a PASS/FAIL table.

> Toggle **capture off** (the capture toggle), not **Quit** — only the capture
> Stop runs the coordinator's `StopSession` effect that emits the marker.

## Two modes

| Mode                          | How                                                                               | Proves                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **CP / provenance (default)** | as above                                                                          | the **front** of the chain (routing came from CP + a verified JWT) **and** the full chain |
| **Fixture fast-loop**         | export `INTENTIVE_DESKTOP_ROUTING_FIXTURE` pointing at the same gateway, then run | only the heartbeat→store→emit→marker half, fast, for inner-loop reruns                    |

**Fixture mode does NOT satisfy the routing-provenance AC** — it bypasses
`GET /agent` and the JWT verification. The harness prints a reminder when it
detects the fixture env.

## Dev-only environment variables

All are read **only** under `#[cfg(debug_assertions)]` and are absent from the
notarized release build (`apps/desktop/src-tauri/src/providers/smoke.rs` +
`lib.rs`). `run-smoke.mjs` sets them for you; they are listed here for manual
runs and for the README.

| Var                                 | Effect                                                                                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `INTENTIVE_HEARTBEAT_INTERVAL_SECS` | Override the 600s cadence so the smoke finishes in ~2 short cycles. Release compiles only the 600s path.                                                                                   |
| `INTENTIVE_SMOKE_STUB_SUMMARIZER`   | `=1` swaps the on-device LLM for a deterministic stub so ticks never skip on an unresolved provider. ScreenPipe is still real.                                                             |
| `INTENTIVE_SMOKE_LOGIN_TOKEN`       | A minted login JWT injected at startup via `set_login_token`, so the AFK run drives the real `GET /agent` path without scripting the webview. Empty/whitespace reads as unset.             |
| `INTENTIVE_SMOKE_LOG`               | File to append the structured `SMOKE {json}` trace to (FSM state changes, `screenpipe_started`/`screenpipe_exited`, `snapshot_emit`, `marker_emit`). Without it, events go to stderr only. |

Harness-side knobs (read by `run-smoke.mjs`, not the app):
`INTENTIVE_SMOKE_MIN_SNAPSHOTS` (default 2),
`INTENTIVE_SMOKE_SNAPSHOT_TIMEOUT_MS`, `INTENTIVE_SMOKE_MARKER_TIMEOUT_MS`,
`INTENTIVE_SMOKE_DB` (override the resolved Snapshot Store path).

## AC → evidence checklist

The PASS/FAIL table maps each Acceptance Criterion to the source that proves it:

| Acceptance Criterion                                                | Evidence                                                                                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Routing issued only for a valid Neon-Auth JWT, over HTTP from CP    | CP stub: `200` for the minted token, `401` for a bad one (real `createJwtVerifier`). Default (non-fixture) mode only.                |
| Capture auto-starts; the chain runs                                 | ≥1 `context_snapshot` receipt at the gateway (real parser accepted)                                                                  |
| Snapshot written to the Store **before** delivery                   | a Snapshot Store row exists for each received `snapshot_id` with `pushed_at` non-null                                                |
| Snapshot is sanitized (no raw ScreenPipe)                           | the stored row carries a non-empty `summary`; the `ContextSnapshot` struct is structurally field-limited (Snapshot Privacy Boundary) |
| `session_end_marker` emitted exactly once on Stop                   | exactly one `session_end_marker` receipt                                                                                             |
| Marker leaves **before** ScreenPipe shutdown (ADR-0022)             | gateway marker `received_at` ≤ `screenpipe_exited` timestamp in the smoke log                                                        |
| Menu bar reflects Capturing → Stopped                               | eyeballed during the manual Stop (also the demo)                                                                                     |
| Settings exposes no ScreenPipe diagnostics / manual endpoint fields | eyeballed in Settings (out of the automated table)                                                                                   |

## How the joints stay real

- **Real ScreenPipe** spawns under `tauri dev`; only the summarizer cadence and
  text are stubbed (dev-gated), never the capture.
- **Real `GET /agent`** over HTTP, with the **real** JWT verifier — the CP stub
  is self-contained (its own keypair) so it tests the verifier, not a mock. A
  live Neon tenant is the documented higher-fidelity optional variant.
- **Real Protocol parser** validates every frame at the gateway; an ack-less
  sender (ADR-0005) has no other contract check.

## Files

- `gateway.mjs` — recording gateway (real handshake + parser).
- `control-plane.mjs` — `GET /agent` + JWKS, real verifier.
- `run-smoke.mjs` — orchestrator (build, launch, wait, assert, teardown).
- `assert.mjs` — evidence correlator + PASS/FAIL table (also runnable standalone
  after a run: `node apps/desktop/smoke/assert.mjs`).

## Teardown / troubleshooting

- The app is launched in its own process group and reaped on teardown
  (SIGTERM → SIGKILL). If a run is interrupted, check for a stray `screenpipe`
  process and kill it manually.
- **Times out waiting for snapshots** → the Mac is not signed in, or a grant is
  missing (capture parked in `SetupRequired`), or ScreenPipe failed its health
  check on `127.0.0.1:44380`. Watch the inherited `tauri dev` console for the
  `SMOKE` lines (`screenpipe_started`, `fsm_state`).
- **Times out waiting for the marker** → did you toggle capture **off** (not
  Quit)?
