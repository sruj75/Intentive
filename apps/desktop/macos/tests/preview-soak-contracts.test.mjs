#!/usr/bin/env node

import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const desktopDirectory = resolve(testDirectory, "../..");
const runner = resolve(testDirectory, "../scripts/preview-soak.mjs");
const temporaryDirectory = await mkdtemp(join(tmpdir(), "intentive-preview-soak."));
const mib = 1024 * 1024;
const memoryGrowthLimitBytes = 100_000_000;

function run(args) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd: desktopDirectory,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      TMPDIR: process.env.TMPDIR,
    },
  });
}

async function writeFixture(name, samples) {
  const path = join(temporaryDirectory, `${name}.fixture.json`);
  await writeFile(
    path,
    `${JSON.stringify(
      {
        schema_version: 1,
        pid: 4242,
        started_at: "2026-07-26T00:00:00.000Z",
        ignored_private_note: "must-not-enter-content-free-evidence",
        samples,
      },
      null,
      2,
    )}\n`,
  );
  return path;
}

async function runFixture(name, samples) {
  const fixture = await writeFixture(name, samples);
  const output = join(temporaryDirectory, `${name}.json`);
  const result = run([
    "--fixture",
    fixture,
    "--duration-seconds",
    "3",
    "--warmup-seconds",
    "1",
    "--sample-interval-seconds",
    "1",
    "--output",
    output,
  ]);
  return { result, output, evidence: JSON.parse(await readFile(output, "utf8")) };
}

const healthySamples = [
  {
    elapsed_seconds: 0,
    rss_bytes: 80 * mib,
    thermal_state: "nominal",
    process_alive: true,
    process_identity_matches: true,
  },
  {
    elapsed_seconds: 1,
    rss_bytes: 100 * mib,
    thermal_state: "fair",
    process_alive: true,
    process_identity_matches: true,
  },
  {
    elapsed_seconds: 2,
    rss_bytes: 130 * mib,
    thermal_state: "nominal",
    process_alive: true,
    process_identity_matches: true,
  },
  {
    elapsed_seconds: 3,
    rss_bytes: 140 * mib,
    thermal_state: "nominal",
    process_alive: true,
    process_identity_matches: true,
  },
];

try {
  const help = run(["--help"]);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--duration-seconds SECONDS\s+\(default: 3600\)/);
  assert.match(help.stdout, /--warmup-seconds SECONDS\s+\(default: 300\)/);
  assert.match(help.stdout, /--sample-interval-seconds SECONDS\s+\(default: 15\)/);
  assert.match(help.stdout, /\/Applications\/Intentive Preview\.app/);
  assert.match(help.stdout, /sampling at intervals no longer than 15 seconds/);
  assert.match(help.stdout, /Fixture evidence does not qualify as a live soak/);

  const packageJSON = JSON.parse(await readFile(join(desktopDirectory, "package.json"), "utf8"));
  assert.equal(packageJSON.scripts["preview:soak"], "node macos/scripts/preview-soak.mjs");
  assert.equal(
    packageJSON.scripts["preview:soak:test"],
    "node macos/tests/preview-soak-evaluator.test.mjs && node macos/tests/preview-soak-contracts.test.mjs",
  );

  const healthy = await runFixture("healthy", healthySamples);
  assert.equal(healthy.result.status, 0, healthy.result.stderr);
  assert.equal(healthy.evidence.schema_version, 1);
  assert.equal(healthy.evidence.evidence_kind, "desktop_preview_soak");
  assert.equal(healthy.evidence.mode, "fixture");
  assert.equal(healthy.evidence.qualifies_as_live_soak, false);
  assert.equal(healthy.evidence.outcome, "passed");
  assert.deepEqual(healthy.evidence.failure_codes, []);
  assert.deepEqual(healthy.evidence.configuration, {
    duration_seconds: 3,
    warmup_seconds: 1,
    sample_interval_seconds: 1,
    memory_growth_limit_bytes: memoryGrowthLimitBytes,
  });
  assert.deepEqual(healthy.evidence.process, {
    bundle_id: "com.heyintentive.desktop.preview",
    pid: 4242,
  });
  assert.equal(healthy.evidence.sample_count, 4);
  assert.equal(healthy.evidence.highest_thermal_state, "fair");
  assert.equal(healthy.evidence.post_warmup_memory_growth_bytes, 40 * mib);
  assert.equal(healthy.evidence.started_at, "2026-07-26T00:00:00.000Z");
  assert.equal(healthy.evidence.ended_at, "2026-07-26T00:00:03.000Z");
  assert.deepEqual(Object.keys(healthy.evidence.samples[0]), [
    "elapsed_seconds",
    "rss_bytes",
    "thermal_state",
    "process_alive",
    "process_identity_matches",
  ]);
  assert.equal((await stat(healthy.output)).mode & 0o777, 0o600);
  assert.doesNotMatch(
    await readFile(healthy.output, "utf8"),
    /must-not-enter-content-free-evidence/,
  );

  const memoryLimit = await runFixture("memory-limit", [
    healthySamples[0],
    healthySamples[1],
    {
      ...healthySamples[2],
      rss_bytes: 100 * mib + memoryGrowthLimitBytes,
    },
    {
      ...healthySamples[3],
      rss_bytes: 100 * mib + memoryGrowthLimitBytes,
    },
  ]);
  assert.equal(memoryLimit.result.status, 1);
  assert.equal(memoryLimit.evidence.outcome, "failed");
  assert.deepEqual(memoryLimit.evidence.failure_codes, ["memory_growth_limit_reached"]);

  const unsafeThermal = await runFixture("unsafe-thermal", [
    healthySamples[0],
    healthySamples[1],
    { ...healthySamples[2], thermal_state: "critical" },
    healthySamples[3],
  ]);
  assert.equal(unsafeThermal.result.status, 1);
  assert.deepEqual(unsafeThermal.evidence.failure_codes, ["serious_or_critical_thermal_state"]);

  const crashed = await runFixture("crashed", [
    healthySamples[0],
    healthySamples[1],
    {
      elapsed_seconds: 2,
      rss_bytes: null,
      thermal_state: "nominal",
      process_alive: false,
      process_identity_matches: false,
    },
    {
      elapsed_seconds: 3,
      rss_bytes: null,
      thermal_state: "nominal",
      process_alive: false,
      process_identity_matches: false,
    },
  ]);
  assert.equal(crashed.result.status, 1);
  assert.ok(crashed.evidence.failure_codes.includes("app_process_lost"));

  const unresolvedOutput = join(temporaryDirectory, "unresolved-app.json");
  const unresolved = run([
    "--app",
    join(temporaryDirectory, "Missing Preview.app"),
    "--pid",
    "999999",
    "--duration-seconds",
    "1",
    "--warmup-seconds",
    "0",
    "--sample-interval-seconds",
    "1",
    "--output",
    unresolvedOutput,
  ]);
  assert.equal(unresolved.status, 1);
  const unresolvedEvidence = JSON.parse(await readFile(unresolvedOutput, "utf8"));
  assert.equal(unresolvedEvidence.outcome, "failed");
  assert.deepEqual(unresolvedEvidence.failure_codes, ["app_bundle_unresolved"]);
  assert.equal(unresolvedEvidence.process.pid, null);
  assert.equal(unresolvedEvidence.sample_count, 0);

  const fakeApp = join(temporaryDirectory, "Fake Preview.app");
  const fakeExecutable = join(fakeApp, "Contents", "MacOS", "Intentive");
  await mkdir(dirname(fakeExecutable), { recursive: true });
  await writeFile(
    join(fakeApp, "Contents", "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>Intentive</string>
<key>CFBundleIdentifier</key><string>com.heyintentive.desktop.preview</string>
</dict></plist>
`,
  );
  await writeFile(fakeExecutable, "#!/bin/sh\nexit 0\n");
  await chmod(fakeExecutable, 0o755);

  const unresolvedPIDOutput = join(temporaryDirectory, "unresolved-pid.json");
  const unresolvedPID = run([
    "--app",
    fakeApp,
    "--duration-seconds",
    "1",
    "--warmup-seconds",
    "0",
    "--sample-interval-seconds",
    "1",
    "--output",
    unresolvedPIDOutput,
  ]);
  assert.equal(unresolvedPID.status, 1);
  const unresolvedPIDEvidence = JSON.parse(await readFile(unresolvedPIDOutput, "utf8"));
  assert.equal(unresolvedPIDEvidence.outcome, "failed");
  assert.deepEqual(unresolvedPIDEvidence.failure_codes, ["app_process_unresolved"]);

  const residue = (await readdir(temporaryDirectory)).filter((name) => name.includes(".tmp-"));
  assert.deepEqual(residue, []);

  console.log("Desktop Preview soak command contracts passed.");
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
