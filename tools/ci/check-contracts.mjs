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

const requiredCiInfraPaths = [
  ".github/workflows/**",
  ".github/filters.yml",
  "tools/ci/**",
  "tools/harness/**",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "turbo.json",
  "tsconfig.base.json",
];

export function inspectCiContracts(repo = process.cwd()) {
  const errors = [];
  const workflowDir = path.join(repo, ".github/workflows");
  const codeqlPath = path.join(workflowDir, "codeql.yml");
  const foundationPath = path.join(workflowDir, "monorepo-foundation.yml");
  const filtersPath = path.join(repo, ".github/filters.yml");
  const candidatePath = path.join(workflowDir, "desktop-release-candidate.yml");
  const releasePath = path.join(workflowDir, "desktop-release.yml");
  const desktopDependencyPolicyPath = path.join(workflowDir, "desktop-dependency-policy.yml");
  const securityAuditPath = path.join(workflowDir, "security-audit.yml");
  const dependabotPath = path.join(repo, ".github/dependabot.yml");
  const workspacePath = path.join(repo, "pnpm-workspace.yaml");

  requireFile(codeqlPath, errors);
  requireFile(foundationPath, errors);
  requireFile(filtersPath, errors);
  requireFile(candidatePath, errors);
  requireFile(releasePath, errors);
  requireFile(securityAuditPath, errors);
  requireFile(dependabotPath, errors);
  requireFile(workspacePath, errors);

  const filterDefinitions = readFilterDefinitions(filtersPath, errors);
  inspectRequiredFailOpenFilters(filterDefinitions, errors);
  inspectFilteredGateWorkflow(foundationPath, "gate", filterDefinitions, errors);
  inspectFilteredGateWorkflow(codeqlPath, "security", filterDefinitions, errors);
  inspectDesktopDependencyPaths(desktopDependencyPolicyPath, filterDefinitions, errors);

  if (existsSync(dependabotPath)) {
    const dependabot = parseDocument(readFileSync(dependabotPath, "utf8"), {
      uniqueKeys: true,
    }).toJS();
    const rootNpmUpdate = dependabot?.updates?.some(
      (update) => update?.["package-ecosystem"] === "npm" && update?.directory === "/",
    );
    if (!rootNpmUpdate) {
      errors.push("Dependabot must update the root pnpm workspace");
    }
  }

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

  if (existsSync(releasePath)) {
    const release = readWorkflow(releasePath, errors);
    const releaseSteps = release?.jobs?.release?.steps;
    if (
      typeof release?.concurrency?.group !== "string" ||
      !release.concurrency.group.includes("inputs.release_version") ||
      release.concurrency?.["cancel-in-progress"] !== false
    ) {
      errors.push("Desktop release workflow must serialize runs by release version");
    }
    if (Array.isArray(releaseSteps)) {
      const artifactAuditIndex = releaseSteps.findIndex(
        (step) =>
          typeof step?.run === "string" && step.run.includes("smoke-signed-desktop-artifact.sh"),
      );
      const tagMutationIndices = releaseSteps
        .map((step, index) =>
          typeof step?.run === "string" &&
          (step.run.includes("git tag --annotate") ||
            step.run.includes('git push origin "refs/tags/$RELEASE_TAG"'))
            ? index
            : -1,
        )
        .filter((index) => index >= 0);
      const tagCreationIndex =
        tagMutationIndices.length === 1 &&
        releaseSteps[tagMutationIndices[0]].run.includes("git tag --annotate") &&
        releaseSteps[tagMutationIndices[0]].run.includes('git push origin "refs/tags/$RELEASE_TAG"')
          ? tagMutationIndices[0]
          : -1;
      const tagStepRun =
        tagCreationIndex >= 0 ? String(releaseSteps[tagCreationIndex]?.run ?? "") : "";
      const draftReleaseIndex = releaseSteps.findIndex(
        (step) =>
          String(step?.uses ?? "").startsWith("softprops/action-gh-release@") &&
          step?.with?.draft === true,
      );
      if (
        artifactAuditIndex < 0 ||
        tagCreationIndex < 0 ||
        draftReleaseIndex < 0 ||
        tagCreationIndex !== artifactAuditIndex + 1 ||
        draftReleaseIndex !== tagCreationIndex + 1
      ) {
        errors.push(
          "Desktop release tag must be created once, directly after signed-artifact audit and immediately before draft release creation",
        );
      }
      if (
        !tagStepRun.includes('git cat-file -t "$RELEASE_TAG"') ||
        !tagStepRun.includes("releases/tags/$RELEASE_TAG") ||
        !tagStepRun.includes("already published")
      ) {
        errors.push(
          "Desktop release tag reuse must require an annotated tag and reject an already-published release",
        );
      }
    }
  }

  const lfsDependentJobs = [
    [codeqlPath, "swift"],
    [foundationPath, "repo-contracts"],
    [foundationPath, "desktop-swift"],
    [candidatePath, "candidate-acceptance"],
    [releasePath, "release"],
    [releasePath, "stage2-proof-and-publish"],
  ];
  for (const [file, jobName] of lfsDependentJobs) {
    if (!existsSync(file)) continue;
    const workflow = readWorkflow(file, errors);
    const steps = workflow?.jobs?.[jobName]?.steps;
    const label = `${path.basename(file)}#${jobName}`;
    if (!Array.isArray(steps)) {
      errors.push(`LFS-dependent CI contract is missing job: ${label}`);
      continue;
    }
    const checkoutSteps = steps.filter((step) =>
      String(step?.uses ?? "").startsWith("actions/checkout@"),
    );
    if (checkoutSteps.length === 0) {
      errors.push(`LFS-dependent job is missing checkout: ${label}`);
      continue;
    }
    if (checkoutSteps.some((step) => step?.with?.lfs !== true)) {
      errors.push(`LFS-dependent job must checkout Git LFS objects: ${label}`);
    }
  }

  const workflowFiles = existsSync(workflowDir)
    ? readdirSync(workflowDir)
        .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
        .sort()
        .map((file) => path.join(workflowDir, file))
    : [];
  for (const file of workflowFiles) {
    const workflow = readWorkflow(file, errors);
    for (const reference of workflowActionReferences(workflow)) {
      if (reference.startsWith("./")) continue;
      if (!isFullCommitShaActionReference(reference)) {
        errors.push(
          `external workflow action must use a full commit SHA: ${path.relative(repo, file)}: ${reference}`,
        );
      }
    }
  }

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
    "apps/desktop/macos/scripts/verify-public-endpoint.sh",
    "apps/desktop/macos/scripts/verify-silero-vad-model.sh",
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

function readFilterDefinitions(file, errors) {
  if (!existsSync(file)) return {};

  const document = parseDocument(readFileSync(file, "utf8"), { uniqueKeys: true });
  if (document.errors.length > 0) {
    errors.push(
      `invalid filter YAML: ${file}: ${document.errors.map((error) => error.message).join("; ")}`,
    );
    return {};
  }

  const filters = document.toJS();
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
    errors.push(`invalid filter YAML: ${file}: root element must be a mapping`);
    return {};
  }
  return filters;
}

function inspectRequiredFailOpenFilters(filterDefinitions, errors) {
  const ciInfraPaths = new Set(flattenStrings(filterDefinitions["ci-infra"]));
  for (const requiredPath of requiredCiInfraPaths) {
    if (!ciInfraPaths.has(requiredPath)) {
      errors.push(`ci-infra filter is missing fail-open path: ${requiredPath}`);
    }
  }
}

function inspectFilteredGateWorkflow(file, aggregatorName, filterDefinitions, errors) {
  if (!existsSync(file)) return;

  const workflow = readWorkflow(file, errors);
  const jobs = workflow?.jobs;
  if (!jobs || typeof jobs !== "object") return;

  const aggregator = jobs[aggregatorName];
  if (!aggregator || typeof aggregator !== "object") {
    errors.push(`CI aggregator is missing: ${path.basename(file)}#${aggregatorName}`);
    return;
  }

  const changes = jobs.changes;
  const swiftOutput = String(changes?.outputs?.swift ?? "");
  if (
    !swiftOutput.includes("steps.filter.outputs['ci-infra']") ||
    !swiftOutput.includes("steps.swift-filter.outputs.swift")
  ) {
    errors.push(
      `Swift output must fail open for CI infrastructure: ${path.basename(file)}#changes`,
    );
  }
  const filterSteps = Array.isArray(changes?.steps) ? changes.steps : [];
  const primaryFilter = filterSteps.find((step) => step?.id === "filter");
  const swiftFilter = filterSteps.find((step) => step?.id === "swift-filter");
  if (
    primaryFilter?.with?.filters !== ".github/filters.yml" ||
    swiftFilter?.with?.filters !== ".github/filters.yml" ||
    swiftFilter?.with?.["predicate-quantifier"] !== "every"
  ) {
    errors.push(
      `changes job must load canonical filters and evaluate Swift with every: ${path.basename(file)}#changes`,
    );
  }

  const expectedNeeds = Object.keys(jobs)
    .filter((jobName) => jobName !== aggregatorName)
    .sort();
  const actualNeeds = normalizeNeeds(aggregator.needs).sort();
  if (
    expectedNeeds.length !== actualNeeds.length ||
    expectedNeeds.some((jobName, index) => jobName !== actualNeeds[index])
  ) {
    errors.push(
      `aggregator needs every other job: ${path.basename(file)}#${aggregatorName} ` +
        `(expected ${expectedNeeds.join(", ")}, found ${actualNeeds.join(", ")})`,
    );
  }

  const aggregatorSteps = Array.isArray(aggregator.steps) ? aggregator.steps : [];
  const aggregatorRun = aggregatorSteps
    .map((step) => step?.run)
    .filter((run) => typeof run === "string")
    .join("\n");
  const aggregatorEnv = Object.assign(
    {},
    ...aggregatorSteps.map((step) => (step?.env && typeof step.env === "object" ? step.env : {})),
  );

  for (const [jobName, job] of Object.entries(jobs)) {
    if (jobName === aggregatorName) continue;
    const condition = String(job?.if ?? "");
    const referencedFilters = [
      ...condition.matchAll(/needs\.changes\.outputs\.([A-Za-z0-9_-]+)/g),
    ].map((match) => match[1]);
    for (const filterName of referencedFilters) {
      if (!Object.prototype.hasOwnProperty.call(filterDefinitions, filterName)) {
        errors.push(
          `workflow references undefined path filter: ${path.basename(file)}: ${filterName}`,
        );
      }
    }
    if (referencedFilters.length === 0) continue;

    const resultVariable = Object.entries(aggregatorEnv).find(([, value]) =>
      String(value).includes(`needs.${jobName}.result`),
    )?.[0];
    const hasSkipAllowlist =
      resultVariable && resultIsHandledBySkipAllowlist(aggregatorRun, resultVariable);
    const requiresSuccess =
      resultVariable &&
      new RegExp(`(?:test|\\[)[^\\n]*\\$${escapeRegExp(resultVariable)}[^\\n]*= success`).test(
        aggregatorRun,
      );
    if (!hasSkipAllowlist || requiresSuccess) {
      errors.push(
        `conditional job must accept success or skipped: ${path.basename(file)}#${jobName}`,
      );
    }
  }
}

function inspectDesktopDependencyPaths(file, filterDefinitions, errors) {
  if (!existsSync(file)) return;

  const workflow = readWorkflow(file, errors);
  const workflowPaths = workflow?.on?.pull_request?.paths;
  const canonicalPaths = flattenStrings(filterDefinitions["swift-deps"]);
  if (!Array.isArray(workflowPaths) || !sameStringSet(workflowPaths, canonicalPaths)) {
    errors.push("desktop dependency policy paths must match the canonical swift-deps filter");
  }
}

function normalizeNeeds(needs) {
  if (typeof needs === "string") return [needs];
  return Array.isArray(needs) ? needs.filter((need) => typeof need === "string") : [];
}

function flattenStrings(value) {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return value.flatMap(flattenStrings);
}

function sameStringSet(left, right) {
  const leftSet = new Set(left.filter((value) => typeof value === "string"));
  const rightSet = new Set(right);
  return leftSet.size === rightSet.size && [...leftSet].every((value) => rightSet.has(value));
}

function resultIsHandledBySkipAllowlist(run, resultVariable) {
  return [...run.matchAll(/for\s+result\s+in\s+([^;]+);\s*do([\s\S]*?)done/g)].some(
    ([, inputs, body]) =>
      inputs.includes(`"$${resultVariable}"`) &&
      /case\s+"\$result"\s+in\s+success\|skipped\)/.test(body),
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function workflowActionReferences(workflow) {
  return Object.values(workflow?.jobs ?? {}).flatMap((job) => [
    ...(typeof job?.uses === "string" ? [job.uses] : []),
    ...(Array.isArray(job?.steps)
      ? job.steps.map((step) => step?.uses).filter((uses) => typeof uses === "string")
      : []),
  ]);
}

function isFullCommitShaActionReference(reference) {
  const separator = reference.lastIndexOf("@");
  if (separator <= 0) return false;

  const actionPath = reference.slice(0, separator);
  const revision = reference.slice(separator + 1);
  if (!/^[0-9a-fA-F]{40}$/.test(revision)) return false;

  const segments = actionPath.split("/");
  return (
    segments.length >= 2 &&
    segments.every((segment) => segment.length > 0 && !/[@\s]/.test(segment))
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
