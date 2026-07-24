#!/usr/bin/env node

import assert from "node:assert/strict";

import { formatSwiftCoverageSummary, summarizeSwiftCoverage } from "./summarize-swift.mjs";

const summary = summarizeSwiftCoverage({
  data: [
    {
      files: [
        {
          filename: "/repo/apps/desktop/macos/Desktop/Sources/Core/Runtime.swift",
          summary: { lines: { count: 10, covered: 8 } },
        },
        {
          filename: "/tmp/checkouts/Dependency/Sources/Vendor.swift",
          summary: { lines: { count: 100, covered: 100 } },
        },
      ],
    },
  ],
});

assert.deepEqual(summary, { files: 1, lines: 10, covered: 8, percent: 80 });
assert.match(formatSwiftCoverageSummary(summary), /Covered lines: 8\/10/);
assert.match(formatSwiftCoverageSummary(summary), /Line coverage: 80.00%/);
console.log("swift-coverage: fixture test passed");
