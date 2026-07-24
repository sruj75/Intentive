#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";

const retiredWorkflowFiles = [
  "desktop-ci.yml",
  "control-plane-ci.yml",
  "coverage.yml",
  "desktop-release-acceptance.yml",
  "desktop-audit.yml",
];

export function inspectCiContracts(repo = process.cwd()) {
  const errors = [];
  const workflowDir = path.join(repo, ".github/workflows");
  const codeqlPath = path.join(workflowDir, "codeql.yml");
  const foundationPath = path.join(workflowDir, "monorepo-foundation.yml");
  const candidatePath = path.join(workflowDir, "desktop-release-candidate.yml");
  const workspacePath = path.join(repo, "pnpm-workspace.yaml");

  requireFile(codeqlPath, errors);
  requireFile(foundationPath, errors);
  requireFile(candidatePath, errors);
  requireFile(workspacePath, errors);

  if (existsSync(codeqlPath)) {
    const expectedCodeqlLanguages = detectMaintainedLanguages(repo);
    const initSteps = workflowSteps(readWorkflow(codeqlPath, errors)).filter((step) =>
      String(step?.uses ?? "").startsWith("github/codeql-action/init@"),
    );
    // codeql-action/init reads `languages` (plural); a singular `language` key is
    // silently ignored and the action autodetects, so guard against that typo.
    for (const step of initSteps) {
      if (step?.with && Object.prototype.hasOwnProperty.call(step.with, "language")) {
        errors.push("CodeQL init uses the invalid input 'language'; use 'languages'");
      }
    }
    const configured = new Set(
      initSteps
        .flatMap((step) => String(step?.with?.languages ?? "").split(","))
        .map((language) => language.trim())
        .filter(Boolean),
    );
    for (const language of expectedCodeqlLanguages) {
      if (!configured.has(language))
        errors.push(`CodeQL is missing maintained language: ${language}`);
    }
    for (const language of configured) {
      if (!expectedCodeqlLanguages.has(language)) {
        errors.push(`CodeQL config contains stale language: ${language}`);
      }
    }
  }

  for (const retired of retiredWorkflowFiles) {
    if (existsSync(path.join(workflowDir, retired))) {
      errors.push(`retired duplicate workflow still exists: ${retired}`);
    }
  }

  if (existsSync(foundationPath)) {
    const foundation = readWorkflow(foundationPath, errors);
    const runCommands = workflowSteps(foundation)
      .map((step) => step?.run)
      .filter((run) => typeof run === "string");
    for (const group of ["repo-contracts", "node-workspaces", "desktop-swift"]) {
      if (!runCommands.some((command) => command.trim() === `pnpm harness --group ${group}`)) {
        errors.push(`monorepo Gate is missing harness group: ${group}`);
      }
    }
    if (runCommands.some((command) => command.includes("harness:ci"))) {
      errors.push("monorepo Gate must call explicit harness groups, not replay the full harness");
    }
  }

  if (existsSync(candidatePath)) {
    const candidate = readWorkflow(candidatePath, errors);
    const acceptanceCalls = workflowSteps(candidate).filter(
      (step) => typeof step?.run === "string" && step.run.includes("desktop:accept"),
    ).length;
    if (acceptanceCalls !== 1) {
      errors.push(
        `desktop release candidate must run assembled acceptance exactly once (found ${acceptanceCalls})`,
      );
    }
  }

  const workflowFiles = existsSync(workflowDir)
    ? readdirSync(workflowDir)
        .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
        .map((file) => path.join(workflowDir, file))
    : [];
  const publishTransitions = workflowFiles.flatMap((file) => {
    const matches = workflowSteps(readWorkflow(file, errors)).filter(
      (step) =>
        typeof step?.run === "string" && /gh release edit[^\n]*--draft=false/.test(step.run),
    );
    return matches.map(() => path.relative(repo, file));
  });
  if (publishTransitions.length !== 1) {
    errors.push(
      `exactly one workflow may publish a Desktop release (found ${publishTransitions.length}: ${publishTransitions.join(", ")})`,
    );
  }

  const portableDesktopScripts = [
    "apps/desktop/macos/tests/test-signed-artifact-smoke.sh",
    "apps/desktop/macos/scripts/verify-app-bundle.sh",
    "apps/desktop/macos/scripts/smoke-signed-desktop-artifact.sh",
  ];
  for (const relative of portableDesktopScripts) {
    const file = path.join(repo, relative);
    if (
      existsSync(file) &&
      !readFileSync(file, "utf8").includes('export PATH="/bin:/usr/bin:/usr/sbin:/sbin"')
    ) {
      errors.push(`Desktop release script does not enforce baseline PATH: ${relative}`);
    }
  }

  const desktopShellRoot = path.join(repo, "apps/desktop/macos");
  for (const file of listFiles(desktopShellRoot, (candidate) => candidate.endsWith(".sh"))) {
    const source = readFileSync(file, "utf8");
    if (/(^|[|;&() \t])rg([ \t]|$)/m.test(source)) {
      errors.push(
        `Desktop shell tooling depends on non-baseline command rg: ${path.relative(repo, file)}`,
      );
    }
  }

  return errors;
}

function requireFile(file, errors) {
  if (!existsSync(file)) errors.push(`required CI contract file is missing: ${file}`);
}

function readWorkflow(file, errors) {
  const document = parseDocument(readFileSync(file, "utf8"), { uniqueKeys: true });
  if (document.errors.length > 0) {
    errors.push(
      `invalid workflow YAML: ${file}: ${document.errors.map((error) => error.message).join("; ")}`,
    );
    return {};
  }
  return document.toJS();
}

function workflowSteps(workflow) {
  return Object.values(workflow?.jobs ?? {}).flatMap((job) =>
    Array.isArray(job?.steps) ? job.steps : [],
  );
}

function detectMaintainedLanguages(repo) {
  const files = trackedFiles(repo);
  const languages = new Set();
  if (
    files.some(
      (file) =>
        file.startsWith(".github/workflows/") && (file.endsWith(".yml") || file.endsWith(".yaml")),
    )
  ) {
    languages.add("actions");
  }
  const extensionLanguages = new Map([
    [".js", "javascript-typescript"],
    [".jsx", "javascript-typescript"],
    [".mjs", "javascript-typescript"],
    [".cjs", "javascript-typescript"],
    [".ts", "javascript-typescript"],
    [".tsx", "javascript-typescript"],
    [".swift", "swift"],
    [".py", "python"],
    [".rs", "rust"],
  ]);
  for (const file of files) {
    const language = extensionLanguages.get(path.extname(file));
    if (language) languages.add(language);
  }
  return languages;
}

function trackedFiles(repo) {
  if (existsSync(path.join(repo, ".git"))) {
    return execFileSync("git", ["-C", repo, "ls-files", "-z"], { encoding: "utf8" })
      .split("\0")
      .filter(Boolean);
  }
  return listFiles(repo, () => true).map((file) => path.relative(repo, file));
}

function listFiles(root, predicate) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root)) {
    const absolute = path.join(root, entry);
    if (statSync(absolute).isDirectory()) files.push(...listFiles(absolute, predicate));
    else if (predicate(absolute)) files.push(absolute);
  }
  return files;
}

function isMainModule(metaUrl) {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(metaUrl);
}

if (isMainModule(import.meta.url)) {
  const errors = inspectCiContracts(
    process.argv[2] ? path.resolve(process.argv[2]) : process.cwd(),
  );
  if (errors.length > 0) {
    for (const error of errors) console.error(`ci-contracts: ${error}`);
    process.exit(1);
  }
  console.log("ci-contracts: passed");
}
