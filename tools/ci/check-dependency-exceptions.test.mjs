#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { inspectDependencyExceptions } from "./check-dependency-exceptions.mjs";

const repo = mkdtempSync(path.join(tmpdir(), "intentive-dependency-exceptions-"));
try {
  write("pnpm-workspace.yaml", "auditConfig:\n  ignoreGhsas:\n    - GHSA-test-1111-2222\n");
  write(
    "docs/security/dependency-audit-exceptions.json",
    JSON.stringify({
      exceptions: [
        {
          ghsa: "GHSA-test-1111-2222",
          reachability: "Unreachable in the maintained runtime.",
          owner: "Platform",
          expires: "2030-01-01",
        },
      ],
    }),
  );
  assert.deepEqual(inspectDependencyExceptions(repo, new Date("2029-01-01T00:00:00Z")), []);

  const expired = inspectDependencyExceptions(repo, new Date("2031-01-01T00:00:00Z"));
  assert.ok(expired.some((error) => error.includes("expired")));

  write(
    "docs/security/dependency-audit-exceptions.json",
    JSON.stringify({
      exceptions: [
        {
          ghsa: "GHSA-test-1111-2222",
          reachability: "Unreachable in the maintained runtime.",
          owner: "Platform",
          expires: "2030-02-31",
        },
      ],
    }),
  );
  const invalidDate = inspectDependencyExceptions(repo, new Date("2029-01-01T00:00:00Z"));
  assert.ok(invalidDate.some((error) => error.includes("invalid expiry")));
  console.log("dependency-exceptions: fixture test passed");
} finally {
  rmSync(repo, { recursive: true, force: true });
}

function write(relativePath, contents) {
  const absolute = path.join(repo, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}
