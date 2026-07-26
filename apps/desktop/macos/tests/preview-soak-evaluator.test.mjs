#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  evaluateSoakSamples,
  isQualifyingLiveSoak,
  thermalStateFromProcessInfo,
} from "../scripts/preview-soak-core.mjs";

const mib = 1024 * 1024;
const memoryGrowthLimitBytes = 100_000_000;

const healthy = evaluateSoakSamples({
  warmupSeconds: 300,
  memoryGrowthLimitBytes,
  samples: [
    {
      elapsed_seconds: 0,
      rss_bytes: 90 * mib,
      thermal_state: "nominal",
      process_alive: true,
      process_identity_matches: true,
    },
    {
      elapsed_seconds: 300,
      rss_bytes: 110 * mib,
      thermal_state: "fair",
      process_alive: true,
      process_identity_matches: true,
    },
    {
      elapsed_seconds: 3_600,
      rss_bytes: 150 * mib,
      thermal_state: "nominal",
      process_alive: true,
      process_identity_matches: true,
    },
  ],
});

assert.deepEqual(healthy, {
  outcome: "passed",
  failure_codes: [],
  sample_count: 3,
  highest_thermal_state: "fair",
  baseline_post_warmup_rss_bytes: 110 * mib,
  peak_post_warmup_rss_bytes: 150 * mib,
  post_warmup_memory_growth_bytes: 40 * mib,
});

const thresholdReached = evaluateSoakSamples({
  warmupSeconds: 1,
  memoryGrowthLimitBytes,
  samples: [
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
      thermal_state: "nominal",
      process_alive: true,
      process_identity_matches: true,
    },
    {
      elapsed_seconds: 2,
      rss_bytes: 100 * mib + memoryGrowthLimitBytes,
      thermal_state: "nominal",
      process_alive: true,
      process_identity_matches: true,
    },
  ],
});

assert.equal(thresholdReached.outcome, "failed");
assert.deepEqual(thresholdReached.failure_codes, ["memory_growth_limit_reached"]);
assert.equal(thresholdReached.post_warmup_memory_growth_bytes, memoryGrowthLimitBytes);

const unsafeThermalState = evaluateSoakSamples({
  warmupSeconds: 1,
  memoryGrowthLimitBytes,
  samples: [
    {
      elapsed_seconds: 0,
      rss_bytes: 80 * mib,
      thermal_state: "nominal",
      process_alive: true,
      process_identity_matches: true,
    },
    {
      elapsed_seconds: 1,
      rss_bytes: 80 * mib,
      thermal_state: "serious",
      process_alive: true,
      process_identity_matches: true,
    },
  ],
});

assert.equal(unsafeThermalState.outcome, "failed");
assert.deepEqual(unsafeThermalState.failure_codes, ["serious_or_critical_thermal_state"]);
assert.equal(unsafeThermalState.highest_thermal_state, "serious");

const crashed = evaluateSoakSamples({
  warmupSeconds: 1,
  memoryGrowthLimitBytes,
  samples: [
    {
      elapsed_seconds: 0,
      rss_bytes: 80 * mib,
      thermal_state: "nominal",
      process_alive: true,
      process_identity_matches: true,
    },
    {
      elapsed_seconds: 1,
      rss_bytes: null,
      thermal_state: "nominal",
      process_alive: false,
      process_identity_matches: false,
    },
  ],
});

assert.equal(crashed.outcome, "failed");
assert.ok(crashed.failure_codes.includes("app_process_lost"));

const recycledPID = evaluateSoakSamples({
  warmupSeconds: 1,
  memoryGrowthLimitBytes,
  samples: [
    {
      elapsed_seconds: 0,
      rss_bytes: 80 * mib,
      thermal_state: "nominal",
      process_alive: true,
      process_identity_matches: true,
    },
    {
      elapsed_seconds: 1,
      rss_bytes: 81 * mib,
      thermal_state: "nominal",
      process_alive: true,
      process_identity_matches: false,
    },
  ],
});

assert.equal(recycledPID.outcome, "failed");
assert.ok(recycledPID.failure_codes.includes("app_process_identity_changed"));

assert.equal(
  isQualifyingLiveSoak({
    mode: "live",
    outcome: "passed",
    durationSeconds: 3_600,
    warmupSeconds: 300,
    sampleIntervalSeconds: 15,
  }),
  true,
);
for (const nonQualifying of [
  {
    mode: "fixture",
    outcome: "passed",
    durationSeconds: 3_600,
    warmupSeconds: 300,
    sampleIntervalSeconds: 15,
  },
  {
    mode: "live",
    outcome: "failed",
    durationSeconds: 3_600,
    warmupSeconds: 300,
    sampleIntervalSeconds: 15,
  },
  {
    mode: "live",
    outcome: "passed",
    durationSeconds: 3_599,
    warmupSeconds: 300,
    sampleIntervalSeconds: 15,
  },
  {
    mode: "live",
    outcome: "passed",
    durationSeconds: 3_600,
    warmupSeconds: 3_600,
    sampleIntervalSeconds: 15,
  },
  {
    mode: "live",
    outcome: "passed",
    durationSeconds: 3_600,
    warmupSeconds: 300,
    sampleIntervalSeconds: 16,
  },
]) {
  assert.equal(isQualifyingLiveSoak(nonQualifying), false);
}

assert.equal(thermalStateFromProcessInfo("0\n"), "nominal");
assert.equal(thermalStateFromProcessInfo("1"), "fair");
assert.equal(thermalStateFromProcessInfo("2"), "serious");
assert.equal(thermalStateFromProcessInfo("3"), "critical");
assert.throws(() => thermalStateFromProcessInfo("4"), /unknown thermal state/);
assert.throws(() => thermalStateFromProcessInfo(" \n"), /unknown thermal state/);

console.log("Desktop Preview soak evaluator tests passed.");
