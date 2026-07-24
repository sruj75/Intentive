#!/usr/bin/env node

import assert from "node:assert/strict";
import { access, copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const stage2Directory = resolve(testDirectory, "../scripts/stage2");
const temporaryDirectory = await mkdtemp(join(tmpdir(), "intentive-stage2-contracts."));

async function requireExecutable(name) {
  const path = join(stage2Directory, name);
  await access(path, constants.R_OK | constants.X_OK);
  const result = spawnSync(path, ["--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, `${name} --help failed:\n${result.stderr}`);
  for (const flag of [
    "--candidate-dmg",
    "--release-tag",
    "--candidate-sha",
    "--dmg-sha256",
    "--output",
    "--evidence-root",
  ]) {
    assert.match(result.stdout, new RegExp(flag), `${name} help omits ${flag}`);
  }
}

async function smokePMBSimulator() {
  const output = join(temporaryDirectory, "pmb.json");
  const child = spawn(
    process.execPath,
    [
      join(stage2Directory, "pmb-simulator.mjs"),
      "--port",
      "0",
      "--message-id",
      "contract-pmb",
      "--body",
      "contract body",
      "--output",
      output,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  let stdout = "";
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const firstLine = await new Promise((resolveLine, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("PMB simulator did not announce its URL")),
      5000,
    );
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const newline = stdout.indexOf("\n");
      if (newline !== -1) {
        clearTimeout(timeout);
        resolveLine(stdout.slice(0, newline));
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`PMB simulator exited early (${code}): ${stderr}`));
    });
  });

  const { ws_url: wsURL } = JSON.parse(firstLine);
  const socket = new WebSocket(wsURL);
  await new Promise((resolveSocket, reject) => {
    const timeout = setTimeout(() => reject(new Error("PMB simulator handshake timed out")), 5000);
    socket.addEventListener("open", () => {
      socket.send(
        JSON.stringify({
          type: "connect",
          auth_token: "stage2-contract-runtime-jwt",
          client_kind: "desktop",
          client_version: "0.1.1",
        }),
      );
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "companion_message") {
        socket.send(JSON.stringify({ type: "delivery_ack", message_id: message.message_id }));
      }
    });
    socket.addEventListener("close", () => {
      clearTimeout(timeout);
      resolveSocket();
    });
    socket.addEventListener("error", reject);
  });

  const exitCode = await new Promise((resolveExit) => child.once("exit", resolveExit));
  assert.equal(exitCode, 0, `PMB simulator failed:\n${stderr}`);
  const proof = JSON.parse(await readFile(output, "utf8"));
  assert.deepEqual(
    { ok: proof.ok, acked: proof.acked, message_id: proof.message_id },
    { ok: true, acked: true, message_id: "contract-pmb" },
  );
}

async function smokeJWTMint() {
  const server = createServer((request, response) => {
    if (request.url === "/api/auth/sign-in/email" && request.method === "POST") {
      response.writeHead(200, {
        "content-type": "application/json",
        "set-cookie": "better-auth.session_token=release-test-session; Path=/; HttpOnly",
      });
      response.end('{"ok":true}');
      return;
    }
    if (
      request.url === "/api/auth/token" &&
      request.headers.cookie === "better-auth.session_token=release-test-session"
    ) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"token":"header.payload.signature"}');
      return;
    }
    response.writeHead(401);
    response.end();
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const { port } = server.address();
  const child = spawn(process.execPath, [join(stage2Directory, "mint-release-test-jwt.mjs")], {
    env: {
      ...process.env,
      INTENTIVE_NEON_AUTH_URL: `http://127.0.0.1:${port}`,
      DESKTOP_RELEASE_TEST_ACCOUNT_EMAIL: "release@example.com",
      DESKTOP_RELEASE_TEST_ACCOUNT_PASSWORD: "contract-password",
    },
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const status = await new Promise((resolveExit) => child.once("exit", resolveExit));
  await new Promise((resolveClose) => server.close(resolveClose));
  assert.equal(status, 0, `JWT mint contract failed:\n${stderr}`);
  assert.equal(stdout.trim(), "header.payload.signature");
}

try {
  await requireExecutable("sparkle-n1-update-driver.sh");
  await requireExecutable("tart-clean-tcc-driver.sh");
  await requireExecutable("full-stack-signed-in-driver.sh");

  const sparkleHelp = spawnSync(join(stage2Directory, "sparkle-n1-update-driver.sh"), ["--help"], {
    encoding: "utf8",
  });
  assert.match(sparkleHelp.stdout, /--appcast/);

  for (const source of ["pmb-simulator.mjs", "mint-release-test-jwt.mjs"]) {
    const result = spawnSync(process.execPath, ["--check", join(stage2Directory, source)], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `${source} has invalid JavaScript:\n${result.stderr}`);
  }

  for (const source of [
    "sparkle-n1-update-driver.sh",
    "tart-clean-tcc-driver.sh",
    "full-stack-signed-in-driver.sh",
    "lib/compile-ax-probe.sh",
    "lib/tart-operator-attestation.sh",
    "lib/write-proof.sh",
  ]) {
    const result = spawnSync("bash", ["-n", join(stage2Directory, source)], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `${source} has invalid shell syntax:\n${result.stderr}`);
  }

  for (const source of [
    "SparkleUpdateProbe.swift",
    "TartAcceptanceProbe.swift",
    "TartStateInspector.swift",
    "FullStackProbe.swift",
  ]) {
    const parseDirectory = join(temporaryDirectory, source.replace(".swift", ""));
    await mkdir(parseDirectory);
    const mainSource = join(parseDirectory, "main.swift");
    await copyFile(join(stage2Directory, source), mainSource);
    const result = spawnSync(
      "xcrun",
      [
        "swiftc",
        "-framework",
        "AppKit",
        "-framework",
        "ApplicationServices",
        "-parse",
        join(stage2Directory, "AXProbeSupport.swift"),
        mainSource,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, `${source} does not parse:\n${result.stderr}`);
  }

  await smokePMBSimulator();
  await smokeJWTMint();

  const pmbSource = await readFile(join(stage2Directory, "pmb-simulator.mjs"), "utf8");
  assert.match(pmbSource, /packages\/protocol\/dist\/index\.js/);
  assert.match(pmbSource, /packages\/api-contract\/dist\/index\.js/);
  assert.match(pmbSource, /safeParseClientToRuntimeEvent/);
  assert.match(pmbSource, /parseRuntimeToClientEvent/);
  assert.match(pmbSource, /parseBoundary as parseAPIContract/);

  const sparkleSource = await readFile(
    join(stage2Directory, "sparkle-n1-update-driver.sh"),
    "utf8",
  );
  assert.match(sparkleSource, /INTENTIVE_APP_VERSION="\$BASELINE_VERSION"/);
  assert.match(sparkleSource, /candidate-dmg-app\.manifest/);
  assert.match(sparkleSource, /installed-after-update\.manifest/);
  assert.match(sparkleSource, /cmp -s/);
  assert.match(sparkleSource, /INSTALLED_CONTENT_SHA256.*CANDIDATE_CONTENT_SHA256/s);
  assert.match(sparkleSource, /notarytool submit/);
  assert.doesNotMatch(sparkleSource, /gh release (list|download)/);

  const tartSource = await readFile(join(stage2Directory, "tart-clean-tcc-driver.sh"), "utf8");
  assert.match(tartSource, /@sha256:/);
  assert.match(tartSource, /collect_tart_operator_attestation/);
  assert.match(tartSource, /TartStateInspector/);
  assert.match(tartSource, /state-after-defer\.json/);
  assert.match(tartSource, /state-after-denial\.json/);
  assert.match(tartSource, /verify_operator_step_state/);
  assert.match(tartSource, /state-after-textedit\.json/);
  assert.match(tartSource, /state-after-positive-control\.json/);
  assert.match(tartSource, /state-after-relaunch\.json/);
  assert.match(tartSource, /com\.apple\.TextEdit/);
  assert.match(tartSource, /launchagent-registration\.txt/);
  assert.match(tartSource, /background-items\.txt/);
  assert.doesNotMatch(tartSource, /macos-tahoe-base:latest|TART_ATTESTATION_JSON/);

  const tartInspectorSource = await readFile(
    join(stage2Directory, "TartStateInspector.swift"),
    "utf8",
  );
  assert.match(tartInspectorSource, /UserDefaults\(suiteName: "com\.heyintentive\.desktop"\)/);
  assert.match(tartInspectorSource, /intentive\.desktop\.onboarding\.progress\.v3/);
  assert.match(tartInspectorSource, /app_bundle_id = 'com\.apple\.TextEdit'/);

  const fullStackSource = await readFile(
    join(stage2Directory, "full-stack-signed-in-driver.sh"),
    "utf8",
  );
  assert.match(fullStackSource, /trap cleanup EXIT/);
  assert.match(fullStackSource, /observed_privacy_filtered_perception/);
  assert.match(fullStackSource, /observed_retention_tombstone/);
  assert.match(fullStackSource, /runtime_search_confirmed/);

  console.log(`Stage 2 driver contracts passed (${basename(stage2Directory)}).`);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
