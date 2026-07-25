#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { inspectCiContracts } from "./check-contracts.mjs";

const repo = mkdtempSync(path.join(tmpdir(), "intentive-ci-contracts-"));

try {
  write(
    ".github/filters.yml",
    [
      "ci-infra: &ci-infra",
      '  - ".github/workflows/**"',
      '  - ".github/filters.yml"',
      '  - "tools/ci/**"',
      '  - "tools/harness/**"',
      '  - "package.json"',
      '  - "pnpm-lock.yaml"',
      '  - "pnpm-workspace.yaml"',
      '  - "turbo.json"',
      '  - "tsconfig.base.json"',
      "node:",
      "  - *ci-infra",
      '  - "**/*.ts"',
      "swift:",
      '  - "apps/desktop/**"',
      '  - "!apps/desktop/**/*.md"',
      '  - "!apps/desktop/docs/**"',
      "actions:",
      '  - ".github/workflows/**"',
      "swift-deps:",
      '  - "apps/desktop/macos/Desktop/Package.swift"',
      '  - "apps/desktop/macos/Desktop/Package.resolved"',
      '  - "apps/desktop/macos/scripts/swiftpm.sh"',
      '  - ".github/workflows/desktop-dependency-policy.yml"',
      "",
    ].join("\n"),
  );
  write(
    ".github/workflows/codeql.yml",
    [
      "jobs:",
      "  changes:",
      "    outputs:",
      "      node: ${{ steps.filter.outputs.node }}",
      "      swift: ${{ steps.filter.outputs['ci-infra'] == 'true' || steps.swift-filter.outputs.swift == 'true' }}",
      "      actions: ${{ steps.filter.outputs.actions }}",
      "    steps:",
      "      - uses: dorny/paths-filter@7b450fff21473bca461d4b92ce414b9d0420d706 # v4.0.2",
      "        id: filter",
      "        with:",
      "          filters: .github/filters.yml",
      "      - uses: dorny/paths-filter@7b450fff21473bca461d4b92ce414b9d0420d706 # v4.0.2",
      "        id: swift-filter",
      "        with:",
      "          filters: .github/filters.yml",
      "          predicate-quantifier: every",
      "  actions:",
      "    needs: changes",
      "    if: needs.changes.outputs.actions == 'true'",
      "    steps:",
      "      - uses: github/codeql-action/init@e4fba868fa4b1b91e1fdab776edc8cfbe6e9fb81 # v4",
      "        with:",
      "          languages: actions",
      "  js:",
      "    needs: changes",
      "    if: needs.changes.outputs.node == 'true'",
      "    steps:",
      "      - uses: github/codeql-action/init@e4fba868fa4b1b91e1fdab776edc8cfbe6e9fb81 # v4",
      "        with:",
      "          languages: javascript-typescript",
      "  swift:",
      "    needs: changes",
      "    if: needs.changes.outputs.swift == 'true'",
      "    steps:",
      "      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7",
      "        with:",
      "          lfs: true",
      "      - uses: github/codeql-action/init@e4fba868fa4b1b91e1fdab776edc8cfbe6e9fb81 # v4",
      "        with:",
      "          languages: swift",
      "  security:",
      "    needs:",
      "      - changes",
      "      - actions",
      "      - js",
      "      - swift",
      "    steps:",
      "      - env:",
      "          CHANGES: ${{ needs.changes.result }}",
      "          ACTIONS_RESULT: ${{ needs.actions.result }}",
      "          JS_RESULT: ${{ needs.js.result }}",
      "          SWIFT_RESULT: ${{ needs.swift.result }}",
      "        run: |",
      '          for result in "$ACTIONS_RESULT" "$JS_RESULT" "$SWIFT_RESULT"; do',
      '            case "$result" in success|skipped) ;; *) exit 1 ;; esac',
      "          done",
      '          test "$CHANGES" = success',
      "",
    ].join("\n"),
  );
  write("src/index.ts", "export {};\n");
  write("src/main.swift", "struct Main {}\n");
  write(
    ".github/workflows/monorepo-foundation.yml",
    [
      "jobs:",
      "  changes:",
      "    outputs:",
      "      node: ${{ steps.filter.outputs.node }}",
      "      swift: ${{ steps.filter.outputs['ci-infra'] == 'true' || steps.swift-filter.outputs.swift == 'true' }}",
      "    steps:",
      "      - uses: dorny/paths-filter@7b450fff21473bca461d4b92ce414b9d0420d706 # v4.0.2",
      "        id: filter",
      "        with:",
      "          filters: .github/filters.yml",
      "      - uses: dorny/paths-filter@7b450fff21473bca461d4b92ce414b9d0420d706 # v4.0.2",
      "        id: swift-filter",
      "        with:",
      "          filters: .github/filters.yml",
      "          predicate-quantifier: every",
      "  repo-contracts:",
      "    steps:",
      "      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7",
      "        with:",
      "          lfs: true",
      "      - run: pnpm harness --group repo-contracts",
      "  node:",
      "    needs: changes",
      "    if: needs.changes.outputs.node == 'true'",
      "    steps:",
      "      - run: pnpm harness --group node-workspaces",
      "  desktop-swift:",
      "    needs: changes",
      "    if: needs.changes.outputs.swift == 'true'",
      "    steps:",
      "      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7",
      "        with:",
      "          lfs: true",
      "      - run: pnpm harness --group desktop-swift",
      "  gate:",
      "    needs:",
      "      - changes",
      "      - repo-contracts",
      "      - node",
      "      - desktop-swift",
      "    steps:",
      "      - env:",
      "          CHANGES: ${{ needs.changes.result }}",
      "          REPO_CONTRACTS: ${{ needs.repo-contracts.result }}",
      "          NODE_RESULT: ${{ needs.node.result }}",
      "          DESKTOP_SWIFT: ${{ needs.desktop-swift.result }}",
      "        run: |",
      '          for result in "$NODE_RESULT" "$DESKTOP_SWIFT"; do',
      '            case "$result" in success|skipped) ;; *) exit 1 ;; esac',
      "          done",
      '          test "$REPO_CONTRACTS" = success',
      '          test "$CHANGES" = success',
      "",
    ].join("\n"),
  );
  write(
    ".github/workflows/desktop-dependency-policy.yml",
    [
      "on:",
      "  pull_request:",
      "    paths:",
      '      - "apps/desktop/macos/Desktop/Package.swift"',
      '      - "apps/desktop/macos/Desktop/Package.resolved"',
      '      - "apps/desktop/macos/scripts/swiftpm.sh"',
      '      - ".github/workflows/desktop-dependency-policy.yml"',
      "jobs: {}",
      "",
    ].join("\n"),
  );
  write(
    ".github/workflows/desktop-release-candidate.yml",
    [
      "jobs:",
      "  candidate-acceptance:",
      "    steps:",
      "      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7",
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
      "      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7",
      "        with:",
      "          lfs: true",
      "      - run: apps/desktop/macos/scripts/smoke-signed-desktop-artifact.sh",
      '      - run: git cat-file -t "$RELEASE_TAG"; gh api "repos/$GITHUB_REPOSITORY/releases/tags/$RELEASE_TAG"; echo already published; git tag --annotate "$RELEASE_TAG" "$SHA" --message release && git push origin "refs/tags/$RELEASE_TAG"',
      "      - uses: softprops/action-gh-release@3d0d9888cb7fd7b750713d6e236d1fcb99157228 # v3.0.2",
      "        with:",
      "          draft: true",
      "  stage2-proof-and-publish:",
      "    steps:",
      "      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7",
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

  const filtersBaseline = read(".github/filters.yml");
  write(".github/filters.yml", filtersBaseline.replace('  - ".github/filters.yml"\n', ""));
  assert.ok(
    inspectCiContracts(repo).some((error) =>
      error.includes("ci-infra filter is missing fail-open path: .github/filters.yml"),
    ),
  );
  write(".github/filters.yml", filtersBaseline);

  const foundationBaseline = read(".github/workflows/monorepo-foundation.yml");
  write(
    ".github/workflows/monorepo-foundation.yml",
    foundationBaseline.replace("  gate:\n", "  escaped-job:\n    steps: []\n  gate:\n"),
  );
  assert.ok(
    inspectCiContracts(repo).some((error) =>
      error.includes("aggregator needs every other job: monorepo-foundation.yml#gate"),
    ),
  );
  write(".github/workflows/monorepo-foundation.yml", foundationBaseline);

  write(
    ".github/workflows/monorepo-foundation.yml",
    foundationBaseline.replace("steps.filter.outputs['ci-infra'] == 'true' || ", ""),
  );
  assert.ok(
    inspectCiContracts(repo).some((error) =>
      error.includes(
        "Swift output must fail open for CI infrastructure: monorepo-foundation.yml#changes",
      ),
    ),
  );
  write(".github/workflows/monorepo-foundation.yml", foundationBaseline);

  const desktopDependencyBaseline = read(".github/workflows/desktop-dependency-policy.yml");
  write(
    ".github/workflows/desktop-dependency-policy.yml",
    desktopDependencyBaseline.replace('      - "apps/desktop/macos/scripts/swiftpm.sh"\n', ""),
  );
  assert.ok(
    inspectCiContracts(repo).some((error) =>
      error.includes("desktop dependency policy paths must match the canonical swift-deps filter"),
    ),
  );
  write(".github/workflows/desktop-dependency-policy.yml", desktopDependencyBaseline);

  const codeqlBaseline = read(".github/workflows/codeql.yml");
  write(
    ".github/workflows/codeql.yml",
    codeqlBaseline.replace(
      'case "$result" in success|skipped) ;; *) exit 1 ;; esac',
      'test "$result" = success',
    ),
  );
  assert.ok(
    inspectCiContracts(repo).some((error) =>
      error.includes("conditional job must accept success or skipped: codeql.yml#actions"),
    ),
  );
  write(".github/workflows/codeql.yml", codeqlBaseline);

  write(
    ".github/workflows/codeql.yml",
    codeqlBaseline.replace(
      "needs.changes.outputs.actions == 'true'",
      "needs.changes.outputs.undefined-filter == 'true'",
    ),
  );
  assert.ok(
    inspectCiContracts(repo).some((error) =>
      error.includes("workflow references undefined path filter: codeql.yml: undefined-filter"),
    ),
  );
  write(".github/workflows/codeql.yml", codeqlBaseline);

  write(
    ".github/workflows/action-pinning.yml",
    [
      "jobs:",
      "  local:",
      "    uses: ./.github/workflows/local.yml",
      "  pinned:",
      "    steps:",
      "      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7",
      "      - uses: ./path/to/local-action",
      "",
    ].join("\n"),
  );
  assert.equal(
    inspectCiContracts(repo).filter((error) =>
      error.includes("external workflow action must use a full commit SHA"),
    ).length,
    0,
  );

  const longPinnedAction = `${Array.from({ length: 2_048 }, () => "!").join("/")}@${"a".repeat(40)}`;
  write(
    ".github/workflows/action-pinning.yml",
    `jobs:\n  pinned:\n    steps:\n      - uses: "${longPinnedAction}"\n`,
  );
  assert.equal(
    inspectCiContracts(repo).filter((error) =>
      error.includes("external workflow action must use a full commit SHA"),
    ).length,
    0,
  );

  write(
    ".github/workflows/action-pinning.yml",
    [
      "jobs:",
      "  mutable-tag:",
      "    steps:",
      "      - uses: actions/checkout@v7",
      "  mutable-branch:",
      "    uses: example/repository/.github/workflows/reusable.yml@main",
      "",
    ].join("\n"),
  );
  const actionPinningErrors = inspectCiContracts(repo);
  assert.ok(
    actionPinningErrors.includes(
      "external workflow action must use a full commit SHA: .github/workflows/action-pinning.yml: actions/checkout@v7",
    ),
  );
  assert.ok(
    actionPinningErrors.includes(
      "external workflow action must use a full commit SHA: .github/workflows/action-pinning.yml: example/repository/.github/workflows/reusable.yml@main",
    ),
  );
  write(
    ".github/workflows/action-pinning.yml",
    "jobs:\n  local:\n    steps:\n      - uses: ./path/to/local-action\n",
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

function read(relativePath) {
  return readFileSync(path.join(repo, relativePath), "utf8");
}
