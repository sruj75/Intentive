#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(
  await readFile(new URL("../../package.json", import.meta.url), "utf8"),
);
const cleanupSource = await readFile(
  new URL("../../scripts/development-cleanup.sh", import.meta.url),
  "utf8",
);

const killBody = cleanupSource.match(/runtime_cleanup\(\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
const pruneBody = cleanupSource.match(/prune_artifacts\(\) \{([\s\S]*?)\n\}/)?.[1] ?? "";

assert.equal(packageJson.scripts["development:kill"], "bash scripts/development-cleanup.sh --kill");
assert.equal(
  packageJson.scripts["development:clean"],
  "bash scripts/development-cleanup.sh --kill",
);
assert.equal(
  packageJson.scripts["development:prune"],
  "bash scripts/development-cleanup.sh --prune-artifacts",
);

assert.match(killBody, /local-stack\.sh" --down/);
assert.match(killBody, /stop_port 8082/);
assert.match(killBody, /simctl shutdown all/);
assert.match(killBody, /intentive-\*\.png/);
assert.doesNotMatch(killBody, /build-\*\.tar\.gz/);
assert.doesNotMatch(killBody, /eas-build-local-nodejs/);
assert.doesNotMatch(cleanupSource, /simctl uninstall/);
assert.doesNotMatch(cleanupSource, /--clear-cache/);

assert.match(pruneBody, /build-\*\.tar\.gz/);
assert.match(pruneBody, /eas-build-local-nodejs/);

console.log("development cleanup contract: cache-safe kill and explicit prune passed");
