// Orchestrator for the signed-in Capture Session happy-path smoke (#35).
//
// Stands up the controlled Control Plane + gateway, mints a real Neon-Auth-shaped
// login JWT, exports the dev-only smoke env, and launches the *real* Desktop app
// (`tauri dev`) so real ScreenPipe boots and the real FSM/heartbeat/emit/routing
// path runs. It waits AFK for ≥2 heartbeat cycles to land as gateway receipts,
// then waits for the operator's single Stop click (the one device-local action —
// see risk #2 in the plan and `docs/SMOKE.md`), then correlates evidence into a
// PASS/FAIL table.
//
// CP/provenance mode is the default. Set INTENTIVE_SMOKE_FIXTURE=1 to run the
// faster inner-loop variant instead — the runner then synthesizes a routing
// fixture pointing at its own gateway (bypassing GET /agent + JWT verification),
// which does NOT satisfy the provenance AC (documented in SMOKE.md).

import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

import { startControlPlane } from "./control-plane.mjs";
import { startGateway } from "./gateway.mjs";
import { resolveSnapshotDbPath, runAssertions, printTable } from "./assert.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");
const OUT_DIR = join(HERE, ".out");
// The bundled ScreenPipe binary lives *inside* the Intentive Capture helper app
// bundle, not at a flat `resources/screenpipe`, so macOS attributes capture
// permission to "Intentive" rather than the raw helper (ADR-0015). This path
// mirrors the Rust spawn path CAPTURE_HELPER_RESOURCE_PATH in
// `src-tauri/src/domains/capture/config/mod.rs` — the app launches the binary
// from there, the harness reads its auth token from here. Move one, move both.
const SCREENPIPE_BINARY = join(
  REPO_ROOT,
  "apps/desktop/src-tauri/resources/Intentive Capture.app/Contents/MacOS/screenpipe",
);

const MIN_SNAPSHOTS = Number(process.env.INTENTIVE_SMOKE_MIN_SNAPSHOTS ?? 2);
const HEARTBEAT_SECS = process.env.INTENTIVE_HEARTBEAT_INTERVAL_SECS ?? "30";
// Generous ceilings: boot + MIN_SNAPSHOTS cycles, then the operator's Stop click.
const SNAPSHOT_TIMEOUT_MS = Number(process.env.INTENTIVE_SMOKE_SNAPSHOT_TIMEOUT_MS ?? 360_000);
const MARKER_TIMEOUT_MS = Number(process.env.INTENTIVE_SMOKE_MARKER_TIMEOUT_MS ?? 300_000);

function readReceiptCounts(receiptsPath) {
  if (!existsSync(receiptsPath)) return { snapshots: 0, markers: 0 };
  const lines = readFileSync(receiptsPath, "utf8")
    .split("\n")
    .filter((l) => l.trim());
  let snapshots = 0;
  let markers = 0;
  for (const line of lines) {
    const r = JSON.parse(line);
    if (r.type === "context_snapshot" && r.ok) snapshots += 1;
    if (r.type === "session_end_marker" && r.ok) markers += 1;
  }
  return { snapshots, markers };
}

// The bundled ScreenPipe binary is a documented precondition (SMOKE.md §2) and
// has moved on disk before (ADR-0015). Verifying it up front turns a path drift
// into an immediate, correctly-attributed failure instead of a silently empty
// auth token and a confusing snapshot timeout six minutes downstream.
function assertCaptureHelperPresent() {
  if (!existsSync(SCREENPIPE_BINARY)) {
    throw new Error(
      `bundled ScreenPipe binary not found at ${SCREENPIPE_BINARY} — is the ` +
        `Intentive Capture helper bundle in place? (see SMOKE.md §2, ADR-0015)`,
    );
  }
}

function readScreenpipeApiKey() {
  try {
    return execFileSync(SCREENPIPE_BINARY, ["auth", "token"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    // The binary's presence is asserted at startup, so this only fires when
    // ScreenPipe auth isn't initialized yet — a soft, operator-controlled
    // precondition (SMOKE.md §3). Proceed tokenless; capture surfaces the gap.
    return "";
  }
}

async function waitUntil(predicate, { timeoutMs, label }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(1500);
  }
  throw new Error(`timed out after ${Math.round(timeoutMs / 1000)}s waiting for: ${label}`);
}

async function main() {
  // Fail fast on a missing bundled binary (a setup or path-drift bug) before we
  // build packages and stand up the CP + gateway — see assertCaptureHelperPresent.
  assertCaptureHelperPresent();
  mkdirSync(OUT_DIR, { recursive: true });
  const receiptsPath = join(OUT_DIR, "receipts.jsonl");
  const smokeLogPath = join(OUT_DIR, "smoke.log");
  writeFileSync(smokeLogPath, ""); // fresh log per run

  // The .mjs imports resolve `@intentive/{protocol,providers}` to their built
  // dist/. Build them up front so a clean checkout works.
  console.log("🔧 building @intentive/protocol and @intentive/providers …");
  execFileSync(
    "pnpm",
    ["--filter", "@intentive/protocol", "--filter", "@intentive/providers", "build"],
    {
      cwd: REPO_ROOT,
      stdio: "inherit",
    },
  );

  // Fixture fast-loop is opt-in via this harness knob — NOT by pre-exporting
  // INTENTIVE_DESKTOP_ROUTING_FIXTURE, which can't name the gateway's ephemeral
  // port. The runner synthesizes the fixture from `gateway.url` below.
  const usingFixture = Boolean(process.env.INTENTIVE_SMOKE_FIXTURE?.trim());

  const gateway = await startGateway({ receiptsPath });
  console.log(`🛰  gateway listening at ${gateway.url}`);

  const controlPlane = await startControlPlane({ wsUrl: gateway.url });
  console.log(`🛂 control-plane listening at ${controlPlane.url}`);
  const loginToken = await controlPlane.mintLoginToken();

  const env = {
    ...process.env,
    INTENTIVE_HEARTBEAT_INTERVAL_SECS: HEARTBEAT_SECS,
    INTENTIVE_SMOKE_STUB_SUMMARIZER: "1",
    INTENTIVE_SMOKE_LOG: smokeLogPath,
    // Drive the capture FSM to signed-in in both modes (independent of Routing).
    INTENTIVE_SMOKE_CAPTURE_SIGNED_IN: "1",
  };
  const screenpipeApiKey = readScreenpipeApiKey();
  if (screenpipeApiKey) {
    env.SCREENPIPE_API_KEY = screenpipeApiKey;
    console.log("🔐 ScreenPipe local API token loaded for heartbeat requests.");
  }
  if (usingFixture) {
    // Skip GET /agent + JWT verification, but the fixture MUST point at THIS
    // runner's gateway or the receipts file the assertions read stays empty.
    // Synthesize it from gateway.url and drop the CP/login env so nothing
    // short-circuits to the wrong place. Provenance AC is NOT proven here.
    env.INTENTIVE_DESKTOP_ROUTING_FIXTURE = JSON.stringify({
      ws_url: gateway.url,
      runtime_jwt: "fixture-runtime-jwt",
      agent_instance_id: "agent_fixture",
    });
    delete env.INTENTIVE_CONTROL_PLANE_URL;
    delete env.INTENTIVE_SMOKE_LOGIN_TOKEN;
    console.log(
      `⚠️  fixture mode: routing synthesized to ${gateway.url} — provenance AC NOT proven.`,
    );
  } else {
    // Real CP path: a stray fixture would short-circuit provenance.
    delete env.INTENTIVE_DESKTOP_ROUTING_FIXTURE;
    env.INTENTIVE_CONTROL_PLANE_URL = controlPlane.url;
    env.INTENTIVE_SMOKE_LOGIN_TOKEN = loginToken;
  }

  console.log("🚀 launching Desktop app (tauri dev) — real ScreenPipe will boot …");
  const app = spawn("pnpm", ["--filter", "./apps/desktop", "tauri", "dev"], {
    cwd: REPO_ROOT,
    env,
    stdio: "inherit",
    detached: true, // own process group, so teardown can reap the whole tree
  });

  let exitCode = 1;
  try {
    console.log(
      `⏳ waiting for ≥${MIN_SNAPSHOTS} context_snapshot receipt(s) (~${HEARTBEAT_SECS}s/cycle) …`,
    );
    await waitUntil(() => readReceiptCounts(receiptsPath).snapshots >= MIN_SNAPSHOTS, {
      timeoutMs: SNAPSHOT_TIMEOUT_MS,
      label: `${MIN_SNAPSHOTS} context_snapshot receipts (is the Mac signed-in with all three grants?)`,
    });
    console.log(`✅ saw ${readReceiptCounts(receiptsPath).snapshots} snapshot(s).`);

    console.log(
      "\n▶️  ACTION: click the Intentive menu bar → toggle capture OFF (Capturing → Stopped).",
    );
    console.log("   This emits the session_end_marker before ScreenPipe shuts down.\n");
    await waitUntil(() => readReceiptCounts(receiptsPath).markers >= 1, {
      timeoutMs: MARKER_TIMEOUT_MS,
      label: "one session_end_marker receipt (did you toggle capture OFF?)",
    });
    console.log("✅ saw the session_end_marker.");

    // Give the supervisor a beat to publish its terminal screenpipe_exited line.
    await sleep(2000);

    const outcome = runAssertions({
      receiptsPath,
      smokeLogPath,
      dbPath: process.env.INTENTIVE_SMOKE_DB ?? resolveSnapshotDbPath(),
    });
    printTable(outcome);
    if (usingFixture) {
      console.log("ℹ️  fixture mode: the routing-provenance AC is NOT covered by this run.");
    }
    exitCode = outcome.ok ? 0 : 1;
  } catch (err) {
    console.error(`\n❌ ${err.message}`);
    exitCode = 1;
  } finally {
    console.log("🧹 tearing down (app, gateway, control-plane) …");
    try {
      process.kill(-app.pid, "SIGTERM");
    } catch {}
    await sleep(1500);
    try {
      process.kill(-app.pid, "SIGKILL");
    } catch {}
    await gateway.close();
    await controlPlane.close();
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
