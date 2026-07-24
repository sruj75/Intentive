#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { inspectCiContracts } from "./check-contracts.mjs";

const repo = mkdtempSync(path.join(tmpdir(), "intentive-ci-contracts-"));

try {
  write(
    ".github/workflows/codeql.yml",
    [
      "jobs:",
      "  actions:",
      "    steps:",
      "      - uses: github/codeql-action/init@v4",
      "        with:",
      "          languages: actions",
      "  js:",
      "    steps:",
      "      - uses: github/codeql-action/init@v4",
      "        with:",
      "          languages: javascript-typescript",
      "  swift:",
      "    steps:",
      "      - uses: github/codeql-action/init@v4",
      "        with:",
      "          languages: swift",
      "",
    ].join("\n"),
  );
  write("src/index.ts", "export {};\n");
  write("src/main.swift", "struct Main {}\n");
  write(
    ".github/workflows/monorepo-foundation.yml",
    [
      "jobs:",
      "  contracts:",
      "    steps:",
      "      - run: pnpm harness --group repo-contracts",
      "  node:",
      "    steps:",
      "      - run: pnpm harness --group node-workspaces",
      "  desktop:",
      "    steps:",
      "      - run: pnpm harness --group desktop-swift",
      "",
    ].join("\n"),
  );
  write(
    ".github/workflows/desktop-release-candidate.yml",
    "jobs:\n  candidate:\n    steps:\n      - run: pnpm --dir apps/desktop desktop:accept\n",
  );
  write(
    ".github/workflows/desktop-release.yml",
    'jobs:\n  publish:\n    steps:\n      - run: gh release edit "$TAG" --draft=false\n',
  );
  write("pnpm-workspace.yaml", 'packages:\n  - "apps/*"\n');
  write("apps/desktop/macos/check.sh", "#!/bin/sh\ngrep -q expected file\n");

  assert.deepEqual(inspectCiContracts(repo), []);

  write(
    ".github/workflows/monorepo-foundation.yml",
    [
      "jobs:",
      "  gate:",
      "    steps:",
      "      - run: pnpm harness --group repo-contracts",
      "      # - run: pnpm harness --group node-workspaces",
      "      # - run: pnpm harness --group desktop-swift",
      "",
    ].join("\n"),
  );
  write(
    ".github/workflows/codeql.yml",
    "jobs:\n  stale:\n    steps:\n      - uses: github/codeql-action/init@v4\n        with:\n          languages: rust\n  js:\n    steps:\n      - uses: github/codeql-action/init@v4\n        with:\n          languages: javascript-typescript\n",
  );
  write("apps/desktop/macos/check.sh", "#!/bin/sh\nrg -q expected file\n");
  write(
    ".github/workflows/second-publisher.yml",
    'jobs:\n  publish:\n    steps:\n      - run: gh release edit "$TAG" --draft=false\n',
  );

  const errors = inspectCiContracts(repo);
  assert.ok(errors.some((error) => error.includes("missing maintained language: actions")));
  assert.ok(errors.some((error) => error.includes("stale language: rust")));
  assert.ok(errors.some((error) => error.includes("missing harness group: node-workspaces")));
  assert.ok(errors.some((error) => error.includes("missing harness group: desktop-swift")));
  assert.ok(errors.some((error) => error.includes("depends on non-baseline command rg")));
  assert.ok(errors.some((error) => error.includes("exactly one workflow may publish")));

  // The singular `language` input is silently ignored by codeql-action/init,
  // which then autodetects and fails; the contract must reject it explicitly.
  write(
    ".github/workflows/codeql.yml",
    "jobs:\n  swift:\n    steps:\n      - uses: github/codeql-action/init@v4\n        with:\n          language: swift\n",
  );
  assert.ok(
    inspectCiContracts(repo).some((error) =>
      error.includes("CodeQL init uses the invalid input 'language'"),
    ),
  );

  write("src/tool.py", "print('maintained')\n");
  const sourceDriftErrors = inspectCiContracts(repo);
  assert.ok(
    sourceDriftErrors.some((error) => error.includes("missing maintained language: python")),
  );

  write(
    ".github/workflows/monorepo-foundation.yml",
    "jobs:\n  gate:\n    steps: []\n    steps: []\n",
  );
  const malformedErrors = inspectCiContracts(repo);
  assert.ok(malformedErrors.some((error) => error.includes("invalid workflow YAML")));

  console.log("ci-contracts: fixture test passed");
} finally {
  rmSync(repo, { recursive: true, force: true });
}

function write(relativePath, contents) {
  const absolute = path.join(repo, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}
