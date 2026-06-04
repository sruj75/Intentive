#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkContextVocabulary } from "./check-context-vocabulary.mjs";

const repo = mkdtempSync(path.join(tmpdir(), "intentive-context-vocab-"));

try {
  write(
    "apps/mobile/CONTEXT.md",
    `
# Mobile Client

**Mobile Client**:
The iOS application, built with Expo, at apps/mobile/.
_Avoid_: Expo app, mobile surface
`,
  );

  let result = await checkContextVocabulary({
    repoRoot: repo,
    contextFiles: ["apps/mobile/CONTEXT.md"],
  });
  assert.deepEqual(result.failures, []);

  write(
    "apps/mobile/CONTEXT.md",
    `
# Mobile Client

**Mobile Client**:
The iOS application, built with Expo, at apps/mobile/.
_Avoid_: Expo, mobile surface
`,
  );

  result = await checkContextVocabulary({
    repoRoot: repo,
    contextFiles: ["apps/mobile/CONTEXT.md"],
  });
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /bare implementation name "Expo"/);

  console.log("context-vocabulary-docs: fixture test passed");
} finally {
  rmSync(repo, { recursive: true, force: true });
}

function write(relPath, contents) {
  const absPath = path.join(repo, relPath);
  mkdirSync(path.dirname(absPath), { recursive: true });
  writeFileSync(absPath, contents.trimStart());
}
