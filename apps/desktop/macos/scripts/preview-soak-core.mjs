const THERMAL_RANK = new Map([
  ["nominal", 0],
  ["fair", 1],
  ["serious", 2],
  ["critical", 3],
]);

function requireNonNegativeNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative finite number`);
  }
}

function validateSample(sample, index, previousElapsedSeconds) {
  if (sample === null || typeof sample !== "object" || Array.isArray(sample)) {
    throw new TypeError(`sample ${index} must be an object`);
  }
  requireNonNegativeNumber(sample.elapsed_seconds, `sample ${index} elapsed_seconds`);
  if (sample.elapsed_seconds < previousElapsedSeconds) {
    throw new TypeError("samples must be ordered by elapsed_seconds");
  }
  if (!THERMAL_RANK.has(sample.thermal_state)) {
    throw new TypeError(`sample ${index} has an invalid thermal_state`);
  }
  if (typeof sample.process_alive !== "boolean") {
    throw new TypeError(`sample ${index} process_alive must be a boolean`);
  }
  if (typeof sample.process_identity_matches !== "boolean") {
    throw new TypeError(`sample ${index} process_identity_matches must be a boolean`);
  }
  if (sample.process_alive) {
    requireNonNegativeNumber(sample.rss_bytes, `sample ${index} rss_bytes`);
  } else if (sample.rss_bytes !== null) {
    throw new TypeError(`sample ${index} rss_bytes must be null when the process is absent`);
  }
}

export function evaluateSoakSamples({ warmupSeconds, memoryGrowthLimitBytes, samples }) {
  requireNonNegativeNumber(warmupSeconds, "warmupSeconds");
  requireNonNegativeNumber(memoryGrowthLimitBytes, "memoryGrowthLimitBytes");
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new TypeError("samples must contain at least one sample");
  }

  let previousElapsedSeconds = 0;
  let highestThermalState = "nominal";
  const failureCodes = new Set();
  const postWarmupRSS = [];

  for (const [index, sample] of samples.entries()) {
    validateSample(sample, index, previousElapsedSeconds);
    previousElapsedSeconds = sample.elapsed_seconds;

    if (THERMAL_RANK.get(sample.thermal_state) > THERMAL_RANK.get(highestThermalState)) {
      highestThermalState = sample.thermal_state;
    }
    if (!sample.process_alive) {
      failureCodes.add("app_process_lost");
    } else if (!sample.process_identity_matches) {
      failureCodes.add("app_process_identity_changed");
    }
    if (THERMAL_RANK.get(sample.thermal_state) >= THERMAL_RANK.get("serious")) {
      failureCodes.add("serious_or_critical_thermal_state");
    }
    if (
      sample.elapsed_seconds >= warmupSeconds &&
      sample.process_alive &&
      sample.process_identity_matches
    ) {
      postWarmupRSS.push(sample.rss_bytes);
    }
  }

  const baselinePostWarmupRSS = postWarmupRSS[0] ?? null;
  const peakPostWarmupRSS = postWarmupRSS.length === 0 ? null : Math.max(...postWarmupRSS);
  const postWarmupMemoryGrowth =
    baselinePostWarmupRSS === null ? null : peakPostWarmupRSS - baselinePostWarmupRSS;

  if (baselinePostWarmupRSS === null) {
    failureCodes.add("post_warmup_baseline_missing");
  } else if (postWarmupMemoryGrowth >= memoryGrowthLimitBytes) {
    failureCodes.add("memory_growth_limit_reached");
  }

  const orderedFailureCodes = [
    "app_process_lost",
    "app_process_identity_changed",
    "serious_or_critical_thermal_state",
    "post_warmup_baseline_missing",
    "memory_growth_limit_reached",
  ].filter((code) => failureCodes.has(code));

  return {
    outcome: orderedFailureCodes.length === 0 ? "passed" : "failed",
    failure_codes: orderedFailureCodes,
    sample_count: samples.length,
    highest_thermal_state: highestThermalState,
    baseline_post_warmup_rss_bytes: baselinePostWarmupRSS,
    peak_post_warmup_rss_bytes: peakPostWarmupRSS,
    post_warmup_memory_growth_bytes: postWarmupMemoryGrowth,
  };
}

export function thermalStateFromProcessInfo(rawValue) {
  const normalized = String(rawValue).trim();
  if (!/^[0-3]$/.test(normalized)) {
    throw new TypeError("macOS returned an unknown thermal state");
  }
  const state = ["nominal", "fair", "serious", "critical"][Number(normalized)];
  return state;
}

export function isQualifyingLiveSoak({
  mode,
  outcome,
  durationSeconds,
  warmupSeconds,
  sampleIntervalSeconds,
}) {
  return (
    mode === "live" &&
    outcome === "passed" &&
    durationSeconds >= 3_600 &&
    warmupSeconds === 300 &&
    sampleIntervalSeconds <= 15
  );
}
