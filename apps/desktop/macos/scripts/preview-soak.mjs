#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluateSoakSamples,
  isQualifyingLiveSoak,
  thermalStateFromProcessInfo,
} from "./preview-soak-core.mjs";

const DEFAULT_DURATION_SECONDS = 60 * 60;
const DEFAULT_WARMUP_SECONDS = 5 * 60;
const DEFAULT_SAMPLE_INTERVAL_SECONDS = 15;
const MEMORY_GROWTH_LIMIT_BYTES = 100_000_000;
const PREVIEW_BUNDLE_ID = "com.heyintentive.desktop.preview";
const DEFAULT_APP_PATH = "/Applications/Intentive Preview.app";
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../../../..");
const DEFAULT_OUTPUT_PATH = join(repositoryRoot, ".context", "desktop-preview-soak.json");

const usage = `Usage: preview-soak.mjs [options]

Runs the installed Founder Preview soak without launching or installing the app.
The exact Preview process must already be running.

Options:
  --app PATH                           (default: ${DEFAULT_APP_PATH})
  --pid PID                            verify and sample this exact process
  --duration-seconds SECONDS           (default: ${DEFAULT_DURATION_SECONDS})
  --warmup-seconds SECONDS             (default: ${DEFAULT_WARMUP_SECONDS})
  --sample-interval-seconds SECONDS     (default: ${DEFAULT_SAMPLE_INTERVAL_SECONDS})
  --output PATH                        (default: ${DEFAULT_OUTPUT_PATH})
  --fixture PATH                       deterministic test input; never touches the app
  -h, --help

Live acceptance requires at least 3600 seconds, an exact 300-second warm-up,
and sampling at intervals no longer than 15 seconds.
Fixture evidence does not qualify as a live soak.
`;

class SoakError extends Error {
  constructor(code) {
    super(code);
    this.name = "SoakError";
    this.code = code;
  }
}

function requireValue(argumentsList, index, flag) {
  const value = argumentsList[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new SoakError(`missing_value_for_${flag.slice(2).replaceAll("-", "_")}`);
  }
  return value;
}

function parseFiniteNumber(rawValue, label, { allowZero }) {
  const value = Number(rawValue);
  const minimumSatisfied = allowZero ? value >= 0 : value > 0;
  if (!Number.isFinite(value) || !minimumSatisfied) {
    throw new SoakError(`invalid_${label}`);
  }
  return value;
}

function parseArguments(argumentsList) {
  const configuration = {
    appPath: DEFAULT_APP_PATH,
    pid: null,
    durationSeconds: DEFAULT_DURATION_SECONDS,
    warmupSeconds: DEFAULT_WARMUP_SECONDS,
    sampleIntervalSeconds: DEFAULT_SAMPLE_INTERVAL_SECONDS,
    outputPath: DEFAULT_OUTPUT_PATH,
    fixturePath: null,
    help: false,
  };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--help" || argument === "-h") {
      configuration.help = true;
      continue;
    }
    if (argument === "--app") {
      configuration.appPath = requireValue(argumentsList, index, argument);
      index += 1;
      continue;
    }
    if (argument === "--pid") {
      const rawPID = requireValue(argumentsList, index, argument);
      const pid = Number(rawPID);
      if (!Number.isInteger(pid) || pid <= 0) {
        throw new SoakError("invalid_pid");
      }
      configuration.pid = pid;
      index += 1;
      continue;
    }
    if (argument === "--duration-seconds") {
      configuration.durationSeconds = parseFiniteNumber(
        requireValue(argumentsList, index, argument),
        "duration_seconds",
        { allowZero: false },
      );
      index += 1;
      continue;
    }
    if (argument === "--warmup-seconds") {
      configuration.warmupSeconds = parseFiniteNumber(
        requireValue(argumentsList, index, argument),
        "warmup_seconds",
        { allowZero: true },
      );
      index += 1;
      continue;
    }
    if (argument === "--sample-interval-seconds") {
      configuration.sampleIntervalSeconds = parseFiniteNumber(
        requireValue(argumentsList, index, argument),
        "sample_interval_seconds",
        { allowZero: false },
      );
      index += 1;
      continue;
    }
    if (argument === "--output") {
      configuration.outputPath = resolve(requireValue(argumentsList, index, argument));
      index += 1;
      continue;
    }
    if (argument === "--fixture") {
      configuration.fixturePath = resolve(requireValue(argumentsList, index, argument));
      index += 1;
      continue;
    }
    throw new SoakError("unknown_argument");
  }

  if (configuration.warmupSeconds > configuration.durationSeconds) {
    throw new SoakError("warmup_exceeds_duration");
  }
  return configuration;
}

function runCommand(command, argumentsList) {
  return spawnSync(command, argumentsList, {
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true,
  });
}

async function resolvePreviewApplication(appPath) {
  try {
    const appStat = await stat(appPath);
    if (!appStat.isDirectory()) {
      throw new SoakError("app_bundle_unresolved");
    }
  } catch (error) {
    if (error instanceof SoakError) {
      throw error;
    }
    throw new SoakError("app_bundle_unresolved");
  }

  const infoPlist = join(appPath, "Contents", "Info.plist");
  const executableResult = runCommand("/usr/bin/plutil", [
    "-extract",
    "CFBundleExecutable",
    "raw",
    infoPlist,
  ]);
  const bundleResult = runCommand("/usr/bin/plutil", [
    "-extract",
    "CFBundleIdentifier",
    "raw",
    infoPlist,
  ]);
  if (executableResult.status !== 0 || bundleResult.status !== 0) {
    throw new SoakError("app_bundle_unresolved");
  }

  const executableName = executableResult.stdout.trim();
  const bundleID = bundleResult.stdout.trim();
  if (bundleID !== PREVIEW_BUNDLE_ID) {
    throw new SoakError("unexpected_bundle_identifier");
  }
  const executablePath = join(appPath, "Contents", "MacOS", executableName);
  try {
    await access(executablePath, constants.X_OK);
  } catch {
    throw new SoakError("app_executable_unresolved");
  }
  return { bundleID, executablePath };
}

function commandMatchesExecutable(command, executablePath) {
  return command === executablePath || command.startsWith(`${executablePath} `);
}

function processCommand(pid) {
  const result = runCommand("/bin/ps", ["-o", "command=", "-p", String(pid)]);
  if (result.status !== 0) {
    return null;
  }
  const command = result.stdout.trim();
  return command === "" ? null : command;
}

function resolvePreviewPID(executablePath, requestedPID) {
  if (requestedPID !== null) {
    const command = processCommand(requestedPID);
    if (command === null || !commandMatchesExecutable(command, executablePath)) {
      throw new SoakError("app_process_unresolved");
    }
    return requestedPID;
  }

  const result = runCommand("/bin/ps", ["-axo", "pid=,command="]);
  if (result.status !== 0) {
    throw new SoakError("app_process_unresolved");
  }
  const matches = result.stdout
    .split("\n")
    .map((line) => line.match(/^\s*(\d+)\s+(.+)$/))
    .filter((match) => match !== null && commandMatchesExecutable(match[2].trim(), executablePath))
    .map((match) => Number(match[1]));

  if (matches.length === 0) {
    throw new SoakError("app_process_unresolved");
  }
  if (matches.length > 1) {
    throw new SoakError("app_process_ambiguous");
  }
  return matches[0];
}

function readThermalState() {
  const result = runCommand("/usr/bin/osascript", [
    "-l",
    "JavaScript",
    "-e",
    'ObjC.import("Foundation"); Number($.NSProcessInfo.processInfo.thermalState)',
  ]);
  if (result.status !== 0) {
    throw new SoakError("thermal_sampling_failed");
  }
  try {
    return thermalStateFromProcessInfo(result.stdout);
  } catch {
    throw new SoakError("thermal_sampling_failed");
  }
}

function sampleProcess(pid, executablePath, elapsedSeconds) {
  const thermalState = readThermalState();
  const rssResult = runCommand("/bin/ps", ["-o", "rss=", "-p", String(pid)]);
  if (rssResult.status !== 0 || rssResult.stdout.trim() === "") {
    return {
      elapsed_seconds: elapsedSeconds,
      rss_bytes: null,
      thermal_state: thermalState,
      process_alive: false,
      process_identity_matches: false,
    };
  }

  const rssKilobytes = Number(rssResult.stdout.trim());
  if (!Number.isFinite(rssKilobytes) || rssKilobytes < 0) {
    throw new SoakError("rss_sampling_failed");
  }
  const command = processCommand(pid);
  if (command === null) {
    return {
      elapsed_seconds: elapsedSeconds,
      rss_bytes: null,
      thermal_state: thermalState,
      process_alive: false,
      process_identity_matches: false,
    };
  }
  return {
    elapsed_seconds: elapsedSeconds,
    rss_bytes: Math.round(rssKilobytes * 1024),
    thermal_state: thermalState,
    process_alive: true,
    process_identity_matches: commandMatchesExecutable(command, executablePath),
  };
}

function createEmptyEvaluation(failureCodes) {
  return {
    outcome: "failed",
    failure_codes: failureCodes,
    sample_count: 0,
    highest_thermal_state: null,
    baseline_post_warmup_rss_bytes: null,
    peak_post_warmup_rss_bytes: null,
    post_warmup_memory_growth_bytes: null,
  };
}

function buildEvidence({ mode, startedAt, endedAt, configuration, pid, evaluation, samples }) {
  const qualifiesAsLiveSoak = isQualifyingLiveSoak({
    mode,
    outcome: evaluation.outcome,
    durationSeconds: configuration.durationSeconds,
    warmupSeconds: configuration.warmupSeconds,
    sampleIntervalSeconds: configuration.sampleIntervalSeconds,
  });
  return {
    schema_version: 1,
    evidence_kind: "desktop_preview_soak",
    mode,
    qualifies_as_live_soak: qualifiesAsLiveSoak,
    outcome: evaluation.outcome,
    failure_codes: evaluation.failure_codes,
    started_at: startedAt,
    ended_at: endedAt,
    configuration: {
      duration_seconds: configuration.durationSeconds,
      warmup_seconds: configuration.warmupSeconds,
      sample_interval_seconds: configuration.sampleIntervalSeconds,
      memory_growth_limit_bytes: MEMORY_GROWTH_LIMIT_BYTES,
    },
    process: {
      bundle_id: PREVIEW_BUNDLE_ID,
      pid,
    },
    sample_count: evaluation.sample_count,
    highest_thermal_state: evaluation.highest_thermal_state,
    baseline_post_warmup_rss_bytes: evaluation.baseline_post_warmup_rss_bytes,
    peak_post_warmup_rss_bytes: evaluation.peak_post_warmup_rss_bytes,
    post_warmup_memory_growth_bytes: evaluation.post_warmup_memory_growth_bytes,
    samples,
  };
}

async function writeEvidenceAtomically(outputPath, evidence) {
  const outputDirectory = dirname(outputPath);
  await mkdir(outputDirectory, { recursive: true });
  const temporaryPath = join(
    outputDirectory,
    `.${basename(outputPath)}.tmp-${process.pid}-${randomUUID()}`,
  );
  let handle;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, outputPath);
  } catch (error) {
    if (handle !== undefined) {
      await handle.close().catch(() => {});
    }
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

function sanitizeFixtureSamples(samples) {
  if (!Array.isArray(samples)) {
    throw new SoakError("fixture_invalid");
  }
  return samples.map((sample) => ({
    elapsed_seconds: sample?.elapsed_seconds,
    rss_bytes: sample?.rss_bytes,
    thermal_state: sample?.thermal_state,
    process_alive: sample?.process_alive,
    process_identity_matches: sample?.process_identity_matches,
  }));
}

async function runFixture(configuration) {
  let fixture;
  try {
    fixture = JSON.parse(await readFile(configuration.fixturePath, "utf8"));
  } catch {
    throw new SoakError("fixture_invalid");
  }
  if (fixture?.schema_version !== 1 || !Number.isInteger(fixture.pid) || fixture.pid <= 0) {
    throw new SoakError("fixture_invalid");
  }
  const startedAtDate = new Date(fixture.started_at);
  if (Number.isNaN(startedAtDate.valueOf())) {
    throw new SoakError("fixture_invalid");
  }
  const samples = sanitizeFixtureSamples(fixture.samples);
  if (
    samples.length === 0 ||
    samples[0].elapsed_seconds !== 0 ||
    samples.at(-1).elapsed_seconds !== configuration.durationSeconds
  ) {
    throw new SoakError("fixture_duration_mismatch");
  }

  let evaluation;
  try {
    evaluation = evaluateSoakSamples({
      warmupSeconds: configuration.warmupSeconds,
      memoryGrowthLimitBytes: MEMORY_GROWTH_LIMIT_BYTES,
      samples,
    });
  } catch {
    throw new SoakError("fixture_invalid");
  }
  return buildEvidence({
    mode: "fixture",
    startedAt: startedAtDate.toISOString(),
    endedAt: new Date(startedAtDate.valueOf() + configuration.durationSeconds * 1000).toISOString(),
    configuration,
    pid: fixture.pid,
    evaluation,
    samples,
  });
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function runLive(configuration) {
  if (process.platform !== "darwin") {
    throw new SoakError("unsupported_platform");
  }
  const application = await resolvePreviewApplication(configuration.appPath);
  const pid = resolvePreviewPID(application.executablePath, configuration.pid);
  const startedAtDate = new Date();
  const monotonicStart = performance.now();
  const samples = [];

  while (true) {
    const elapsedSeconds =
      samples.length === 0 ? 0 : Number(((performance.now() - monotonicStart) / 1000).toFixed(3));
    const sample = sampleProcess(pid, application.executablePath, elapsedSeconds);
    samples.push(sample);

    const interim = evaluateSoakSamples({
      warmupSeconds: configuration.warmupSeconds,
      memoryGrowthLimitBytes: MEMORY_GROWTH_LIMIT_BYTES,
      samples,
    });
    const terminalFailure = interim.failure_codes.some(
      (code) => code !== "post_warmup_baseline_missing",
    );
    if (terminalFailure || elapsedSeconds >= configuration.durationSeconds) {
      break;
    }

    const nextTargetSeconds = Math.min(
      configuration.durationSeconds,
      elapsedSeconds + configuration.sampleIntervalSeconds,
    );
    await delay(Math.max(0, nextTargetSeconds * 1000 - (performance.now() - monotonicStart)));
  }

  const evaluation = evaluateSoakSamples({
    warmupSeconds: configuration.warmupSeconds,
    memoryGrowthLimitBytes: MEMORY_GROWTH_LIMIT_BYTES,
    samples,
  });
  return buildEvidence({
    mode: "live",
    startedAt: startedAtDate.toISOString(),
    endedAt: new Date().toISOString(),
    configuration,
    pid,
    evaluation,
    samples,
  });
}

async function main() {
  let configuration;
  try {
    configuration = parseArguments(process.argv.slice(2));
  } catch (error) {
    const code = error instanceof SoakError ? error.code : "invalid_arguments";
    console.error(`Desktop Preview soak failed: ${code}`);
    process.exitCode = 2;
    return;
  }
  if (configuration.help) {
    process.stdout.write(usage);
    return;
  }

  const invocationStartedAt = new Date().toISOString();
  let evidence;
  try {
    evidence =
      configuration.fixturePath === null
        ? await runLive(configuration)
        : await runFixture(configuration);
  } catch (error) {
    const code = error instanceof SoakError ? error.code : "soak_runner_failed";
    evidence = buildEvidence({
      mode: configuration.fixturePath === null ? "live" : "fixture",
      startedAt: invocationStartedAt,
      endedAt: new Date().toISOString(),
      configuration,
      pid: null,
      evaluation: createEmptyEvaluation([code]),
      samples: [],
    });
  }

  try {
    await writeEvidenceAtomically(configuration.outputPath, evidence);
  } catch {
    console.error("Desktop Preview soak failed: evidence_write_failed");
    process.exitCode = 2;
    return;
  }

  if (evidence.outcome === "passed") {
    console.log(
      evidence.qualifies_as_live_soak
        ? "Desktop Preview live soak passed."
        : "Desktop Preview diagnostic soak passed.",
    );
    return;
  }
  console.error(`Desktop Preview soak failed: ${evidence.failure_codes.join(",")}`);
  process.exitCode = 1;
}

await main();
