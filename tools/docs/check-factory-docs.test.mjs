#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { checkFactoryDocs } from "./check-factory-docs.mjs";

const repo = mkdtempSync(path.join(tmpdir(), "intentive-factory-docs-check-"));

try {
  writeRepo({
    selfImprovement:
      "# Self Improvement\n\nRecommendation pass first.\nDo not edit tracked files until I approve specific items.\n",
    ledger: [
      "# Factory Ledger",
      "",
      "<!-- intentive:factory-ledger:start -->",
      '{ "updatedAt": null, "entries": { "sample:id": { "id": "sample:id", "title": "Sample", "status": "accepted", "seenCount": 1 } } }',
      "<!-- intentive:factory-ledger:end -->",
      "",
      "## Entries",
      "",
    ].join("\n"),
    backlog: "# Backlog\n\nSee [LEDGER.md](LEDGER.md).\n",
  });

  let failures = await checkFactoryDocs({ repoRoot: repo });
  assert.deepEqual(failures, []);

  write(
    "docs/factory/LEDGER.md",
    "# Ledger\n\n<!-- intentive:factory-ledger:start -->\n{}\n<!-- intentive:factory-ledger:end -->\n",
  );
  failures = await checkFactoryDocs({ repoRoot: repo });
  assert.ok(failures.some((failure) => failure.includes("ledger block is invalid")));

  console.log("factory docs check: fixture test passed");
} finally {
  rmSync(repo, { recursive: true, force: true });
}

function writeRepo(files) {
  for (const relPath of [
    "docs/factory/README.md",
    "docs/factory/SELF-IMPROVEMENT.md",
    "docs/factory/LEDGER.md",
    "docs/factory/BACKLOG.md",
    "docs/factory/decisions/README.md",
  ]) {
    mkdirSync(path.dirname(path.join(repo, relPath)), { recursive: true });
  }

  write("docs/factory/README.md", "# Factory\n");
  write("docs/factory/SELF-IMPROVEMENT.md", files.selfImprovement);
  write("docs/factory/LEDGER.md", files.ledger);
  write("docs/factory/BACKLOG.md", files.backlog);
  write("docs/factory/decisions/README.md", "# Decisions\n");
}

function write(relPath, contents) {
  writeFileSync(path.join(repo, relPath), contents);
}
