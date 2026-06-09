#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";

const harnessPath = new URL("./run-harness.mjs", import.meta.url).pathname;

const rootDryRunOutput = run(["--dry-run"]);
assert.match(rootDryRunOutput, /pnpm docs:agents:test/);
assert.match(rootDryRunOutput, /Root harness dry run completed/);

const scopesOutput = run(["--list-scopes"]);
for (const scope of [
  "apps/mobile",
  "apps/desktop",
  "services/control-plane",
  "services/agent-runtime",
]) {
  assert.match(scopesOutput, new RegExp(escapeRegExp(scope)));
}

const dryRuns = [
  [
    "--scope",
    "apps/mobile",
    "--dry-run",
    /# Mobile Client Harness/,
    /pnpm --dir apps\/mobile test:rn/,
  ],
  ["--scope", "desktop", "--dry-run", /# Desktop Client Harness/, /pnpm --dir apps\/desktop test/],
  [
    "--scope",
    "services/control-plane",
    "--dry-run",
    /# Control Plane Harness/,
    /pnpm --dir services\/control-plane test/,
  ],
  [
    "--scope",
    "services/agent-runtime",
    "--dry-run",
    /# Agent Runtime Harness/,
    /pnpm --dir services\/agent-runtime test/,
  ],
];

for (const [scopeFlag, scope, dryRunFlag, titlePattern, commandPattern] of dryRuns) {
  const output = run([scopeFlag, scope, dryRunFlag]);
  assert.match(output, titlePattern);
  assert.match(output, /Context docs:/);
  assert.match(output, /Common failure modes:/);
  assert.match(output, commandPattern);
  assert.match(output, /dry run completed/);
}

const invalid = spawnSync(
  process.execPath,
  [harnessPath, "--scope", "does-not-exist", "--dry-run"],
  {
    encoding: "utf8",
  },
);
assert.notEqual(invalid.status, 0);
assert.match(invalid.stderr, /Unknown harness scope "does-not-exist"/);
assert.match(invalid.stderr, /Available scopes:/);

console.log("harness-templates: fixture test passed");

function run(args) {
  return execFileSync(process.execPath, [harnessPath, ...args], { encoding: "utf8" });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
