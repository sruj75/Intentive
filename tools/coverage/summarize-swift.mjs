#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function summarizeSwiftCoverage(payload, sourceMarker = "/apps/desktop/macos/Desktop/Sources/") {
  const files = (payload.data ?? [])
    .flatMap((entry) => entry.files ?? [])
    .filter((file) => String(file.filename ?? "").includes(sourceMarker));
  const totals = files.reduce(
    (result, file) => {
      const lines = file.summary?.lines;
      if (typeof lines?.count === "number") result.lines += lines.count;
      if (typeof lines?.covered === "number") result.covered += lines.covered;
      return result;
    },
    { files: files.length, lines: 0, covered: 0 },
  );

  return {
    ...totals,
    percent: totals.lines === 0 ? 0 : (totals.covered / totals.lines) * 100,
  };
}

export function formatSwiftCoverageSummary(summary) {
  return [
    "## Desktop Swift Coverage",
    "",
    `- Source files: ${summary.files}`,
    `- Covered lines: ${summary.covered}/${summary.lines}`,
    `- Line coverage: ${summary.percent.toFixed(2)}%`,
    "",
    "Coverage is review evidence, not a blocking percentage threshold.",
    "",
  ].join("\n");
}

function isMainModule(metaUrl) {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(metaUrl);
}

if (isMainModule(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error("Usage: summarize-swift.mjs INPUT_JSON OUTPUT_MARKDOWN");
    process.exit(1);
  }
  const summary = summarizeSwiftCoverage(JSON.parse(readFileSync(input, "utf8")));
  if (summary.files === 0) {
    console.error("swift-coverage: no maintained Desktop source files found in coverage export");
    process.exit(1);
  }
  writeFileSync(output, formatSwiftCoverageSummary(summary));
  console.log(formatSwiftCoverageSummary(summary));
}
