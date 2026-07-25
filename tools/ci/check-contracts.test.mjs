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
      "      - uses: actions/checkout@v7",
      "        with:",
      "          lfs: true",
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
      "  repo-contracts:",
      "    steps:",
      "      - uses: actions/checkout@v7",
      "        with:",
      "          lfs: true",
      "      - run: pnpm harness --group repo-contracts",
      "  node:",
      "    steps:",
      "      - run: pnpm harness --group node-workspaces",
      "  desktop-swift:",
      "    steps:",
      "      - uses: actions/checkout@v7",
      "        with:",
      "          lfs: true",
      "      - run: pnpm harness --group desktop-swift",
      "",
    ].join("\n"),
  );
  write(
    ".github/workflows/desktop-release-candidate.yml",
    [
      "jobs:",
      "  candidate-acceptance:",
      "    steps:",
      "      - uses: actions/checkout@v7",
      "        with:",
      "          lfs: true",
      "      - run: pnpm --dir apps/desktop desktop:accept",
      "",
    ].join("\n"),
  );
  write(
    ".github/workflows/desktop-release.yml",
    [
      "concurrency:",
      "  group: desktop-release-${{ inputs.release_version }}",
      "  cancel-in-progress: false",
      "jobs:",
      "  release:",
      "    steps:",
      "      - uses: actions/checkout@v7",
      "        with:",
      "          lfs: true",
      "      - run: apps/desktop/macos/scripts/smoke-signed-desktop-artifact.sh",
      '      - run: git cat-file -t "$RELEASE_TAG"; gh api "repos/$GITHUB_REPOSITORY/releases/tags/$RELEASE_TAG"; echo already published; git tag --annotate "$RELEASE_TAG" "$SHA" --message release && git push origin "refs/tags/$RELEASE_TAG"',
      "      - uses: softprops/action-gh-release@v3",
      "        with:",
      "          draft: true",
      "  stage2-proof-and-publish:",
      "    steps:",
      "      - uses: actions/checkout@v7",
      "        with:",
      "          lfs: true",
      '      - run: gh release edit "$TAG" --draft=false',
      "",
    ].join("\n"),
  );
  write(
    ".github/workflows/security-audit.yml",
    'on:\n  pull_request:\n    paths:\n      - "package.json"\n',
  );
  write(
    ".github/dependabot.yml",
    "version: 2\nupdates:\n  - package-ecosystem: npm\n    directory: /\n",
  );
  write("pnpm-workspace.yaml", 'packages:\n  - "apps/*"\n');
  write("apps/desktop/macos/check.sh", "#!/bin/sh\ngrep -q expected file\n");

  assert.deepEqual(inspectCiContracts(repo), []);

  write(
    ".github/workflows/desktop-release.yml",
    [
      "concurrency:",
      "  group: desktop-release-${{ inputs.release_version }}",
      "  cancel-in-progress: false",
      "jobs:",
      "  release:",
      "    steps:",
      "      - uses: actions/checkout@v7",
      "        with:",
      "          lfs: true",
      '      - run: git tag --annotate "$RELEASE_TAG" "$SHA" --message release && git push origin "refs/tags/$RELEASE_TAG"',
      "      - run: apps/desktop/macos/scripts/smoke-signed-desktop-artifact.sh",
      "      - uses: softprops/action-gh-release@v3",
      "        with:",
      "          draft: true",
      "  stage2-proof-and-publish:",
      "    steps:",
      "      - uses: actions/checkout@v7",
      "        with:",
      "          lfs: true",
      '      - run: gh release edit "$TAG" --draft=false',
      "",
    ].join("\n"),
  );
  assert.ok(
    inspectCiContracts(repo).some((error) =>
      error.includes("directly after signed-artifact audit"),
    ),
  );

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

  write(
    ".github/workflows/desktop-release-candidate.yml",
    [
      "jobs:",
      "  candidate-acceptance:",
      "    steps:",
      "      - uses: actions/checkout@v7",
      "      - run: pnpm --dir apps/desktop desktop:accept",
      "",
    ].join("\n"),
  );
  assert.ok(
    inspectCiContracts(repo).some((error) =>
      error.includes(
        "LFS-dependent job must checkout Git LFS objects: desktop-release-candidate.yml#candidate-acceptance",
      ),
    ),
  );

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
