#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

import { LEDGER_STATUSES } from "../factory/finding-ids.mjs";
import { parseLedgerMarkdown } from "../factory/ledger.mjs";

const factoryDocs = [
  "docs/factory/README.md",
  "docs/factory/SELF-IMPROVEMENT.md",
  "docs/factory/LEDGER.md",
  "docs/factory/BACKLOG.md",
  "docs/factory/decisions/README.md",
];

const usage = `Intentive factory-docs checker

Checks the structural contracts for docs/factory files.

Usage:
  node tools/docs/check-factory-docs.mjs [--repo <path>]
`;

export async function checkFactoryDocs({ repoRoot = process.cwd() } = {}) {
  const failures = [];

  for (const relPath of factoryDocs) {
    const absPath = path.join(repoRoot, relPath);
    let content;
    try {
      content = await readFile(absPath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        failures.push(`${relPath} is missing`);
        continue;
      }
      throw error;
    }

    if (relPath.endsWith("SELF-IMPROVEMENT.md")) {
      if (!content.includes("Do not edit tracked files until I approve specific items")) {
        failures.push(`${relPath} must contain the no-edit-first rule`);
      }
      if (!content.includes("Recommendation pass first")) {
        failures.push(`${relPath} must require a recommendation-only first pass`);
      }
    }

    if (relPath.endsWith("LEDGER.md")) {
      try {
        const ledger = parseLedgerMarkdown(content);
        for (const entry of Object.values(ledger.entries)) {
          if (!LEDGER_STATUSES.includes(entry.status)) {
            failures.push(`${relPath} entry ${entry.id} uses unknown status ${entry.status}`);
          }
        }
      } catch (error) {
        failures.push(`${relPath} ledger block is invalid: ${error.message}`);
      }
    }

    if (relPath.endsWith("BACKLOG.md")) {
      if (!content.includes("LEDGER.md")) {
        failures.push(`${relPath} must link back to ledger IDs`);
      }
    }
  }

  return failures;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = process.argv.includes("--repo")
    ? process.argv[process.argv.indexOf("--repo") + 1]
    : process.cwd();

  const failures = await checkFactoryDocs({ repoRoot });
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(failure);
    }
    process.exit(1);
  }

  console.log("factory docs: check passed");
}
