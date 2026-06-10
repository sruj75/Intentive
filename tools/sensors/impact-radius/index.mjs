#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const parser = require("@typescript-eslint/parser");

const sourceExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const ignoredDirectories = new Set([
  ".git",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  "target",
]);
const ignoredPathFragments = ["/reference/"];

const workspaceRoots = ["apps", "services", "packages"];
const loadBearingHints = new Map([
  ["packages/protocol", ["apps/mobile", "apps/desktop", "services/agent-runtime"]],
  ["packages/api-contract", ["apps/mobile", "services/control-plane", "services/agent-runtime"]],
  ["packages/providers", ["services/control-plane", "services/agent-runtime"]],
]);

const usage = `Intentive impact radius sensor

Reports review-triage facts for the current change set. This sensor is advisory:
large impact radius is not a failure.

Usage:
  pnpm sensor:impact-radius
  node tools/sensors/impact-radius/index.mjs [--base <ref>] [--repo <path>]

Options:
  --base <ref>   Git ref to compare against. Defaults to HEAD.
  --repo <path>  Repository root to analyze. Defaults to the current directory.
  --help         Show this help.
`;

if (isMainModule(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage);
      process.exit(0);
    }

    const report = analyzeImpactRadius(options);
    console.log(formatReport(report));
  } catch (error) {
    console.error(`impact-radius: ${error.message}`);
    process.exit(1);
  }
}

export function analyzeImpactRadius({ repo, base }) {
  const repoRoot = path.resolve(repo);
  const workspaces = discoverWorkspaces(repoRoot);
  const workspacesByName = new Map(workspaces.map((workspace) => [workspace.name, workspace]));
  const sourceFiles = listSourceFiles(repoRoot);
  const sourceFileSet = new Set(sourceFiles);
  const modules = new Map();

  for (const relPath of sourceFiles) {
    const absPath = path.join(repoRoot, relPath);
    const code = readFileSync(absPath, "utf8");
    const ast = parseSource(code, relPath);
    const imports = [...new Set([...extractImportSpecs(ast), ...extractReExportSpecs(ast)])];
    const resolvedImports = [];

    for (const spec of imports) {
      const resolved = resolveImport({
        spec,
        importerRelPath: relPath,
        repoRoot,
        sourceFileSet,
        workspacesByName,
      });

      if (resolved) {
        resolvedImports.push(resolved);
      }
    }

    modules.set(relPath, {
      ast,
      imports: resolvedImports,
      workspace: workspaceForPath(workspaces, relPath),
      exports: collectExportNames(ast),
      reExports: extractReExportSpecs(ast).map((spec) =>
        resolveImport({
          spec,
          importerRelPath: relPath,
          repoRoot,
          sourceFileSet,
          workspacesByName,
        }),
      ),
    });
  }

  const reverseImports = buildReverseImports(modules);
  const changedFiles = getChangedFiles(repoRoot, base);
  const changedSourceFiles = changedFiles.filter((file) => sourceFileSet.has(file));
  const boundaryImports = collectBoundaryImports(modules);
  const publicExports = collectTouchedPublicExports({
    repoRoot,
    workspaces,
    modules,
    sourceFileSet,
    changedSourceFiles,
  });
  const affectedWorkspaces = collectAffectedWorkspaces({
    workspaces,
    workspacesByName,
    modules,
    reverseImports,
    changedFiles,
    changedSourceFiles,
  });

  return {
    base,
    repoRoot,
    changedFiles,
    changedSourceFiles,
    fan: changedSourceFiles.map((file) => ({
      file,
      fanIn: reverseImports.get(file)?.size ?? 0,
      fanOut: modules.get(file)?.imports.length ?? 0,
    })),
    boundaryImports,
    publicExports,
    affectedWorkspaces,
  };
}

function parseArgs(args) {
  const options = { base: "HEAD", repo: process.cwd(), help: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--base") {
      options.base = requireValue(args, index, arg);
      index += 1;
    } else if (arg === "--repo") {
      options.repo = requireValue(args, index, arg);
      index += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return options;
}

function requireValue(args, index, arg) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${arg} requires a value`);
  }

  return value;
}

function discoverWorkspaces(repoRoot) {
  const workspaces = [];

  for (const root of workspaceRoots) {
    const absRoot = path.join(repoRoot, root);
    if (!exists(absRoot)) continue;

    for (const name of readdirSync(absRoot).sort()) {
      const relRoot = `${root}/${name}`;
      const packageJsonPath = path.join(repoRoot, relRoot, "package.json");
      if (!exists(packageJsonPath)) continue;

      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
      workspaces.push({
        relRoot,
        packageJson,
        name: packageJson.name ?? relRoot,
        kind: root,
      });
    }
  }

  return workspaces;
}

function listSourceFiles(repoRoot) {
  const files = [];

  for (const root of workspaceRoots) {
    const absRoot = path.join(repoRoot, root);
    if (exists(absRoot)) {
      walk(absRoot, repoRoot, files);
    }
  }

  return files.sort();
}

function walk(absDir, repoRoot, files) {
  for (const entry of readdirSync(absDir).sort()) {
    const absPath = path.join(absDir, entry);
    const relPath = toRepoPath(repoRoot, absPath);
    const stat = statSync(absPath);

    if (stat.isDirectory()) {
      if (ignoredDirectories.has(entry) || isIgnoredPath(relPath)) continue;
      walk(absPath, repoRoot, files);
      continue;
    }

    if (stat.isFile() && isSourceFile(relPath) && !isIgnoredPath(relPath)) {
      files.push(relPath);
    }
  }
}

function isSourceFile(relPath) {
  return sourceExtensions.includes(path.extname(relPath));
}

function isIgnoredPath(relPath) {
  const normalized = `/${relPath.replace(/\\/g, "/")}`;
  return ignoredPathFragments.some((fragment) => normalized.includes(fragment));
}

function parseSource(code, relPath) {
  try {
    return parser.parse(code, {
      comment: false,
      ecmaFeatures: { jsx: relPath.endsWith(".tsx") || relPath.endsWith(".jsx") },
      ecmaVersion: "latest",
      errorOnUnknownASTType: false,
      sourceType: "module",
    });
  } catch (error) {
    throw new Error(`failed to parse ${relPath}: ${error.message}`);
  }
}

function extractImportSpecs(ast) {
  const specs = [];

  visit(ast, (node) => {
    if (node.type === "ImportDeclaration" && isStringLiteral(node.source)) {
      specs.push(node.source.value);
    }

    if (node.type === "ImportExpression" && isStringLiteral(node.source)) {
      specs.push(node.source.value);
    }
  });

  return specs;
}

function extractReExportSpecs(ast) {
  const specs = [];

  visit(ast, (node) => {
    if (
      (node.type === "ExportAllDeclaration" || node.type === "ExportNamedDeclaration") &&
      isStringLiteral(node.source)
    ) {
      specs.push(node.source.value);
    }
  });

  return specs;
}

function collectExportNames(ast) {
  const names = new Set();

  for (const node of ast.body ?? []) {
    if (node.type === "ExportDefaultDeclaration") {
      names.add("default");
      continue;
    }

    if (node.type !== "ExportNamedDeclaration") continue;

    if (node.declaration) {
      collectDeclarationNames(node.declaration, names);
    }

    for (const specifier of node.specifiers ?? []) {
      if (specifier.exported?.name) {
        names.add(specifier.exported.name);
      }
    }
  }

  return [...names].sort();
}

function collectDeclarationNames(declaration, names) {
  if (declaration.id?.name) {
    names.add(declaration.id.name);
  }

  for (const declarator of declaration.declarations ?? []) {
    if (declarator.id?.name) {
      names.add(declarator.id.name);
    }
  }
}

function resolveImport({ spec, importerRelPath, repoRoot, sourceFileSet, workspacesByName }) {
  if (spec.startsWith(".")) {
    return resolveRelativeImport(importerRelPath, spec, sourceFileSet);
  }

  const packageName = intentivePackageName(spec);
  if (!packageName) return null;

  const workspace = workspacesByName.get(packageName);
  if (!workspace) return null;

  const subpath = spec.slice(packageName.length);
  return resolvePackageImport({
    repoRoot,
    workspace,
    subpath: subpath ? `.${subpath}` : ".",
    sourceFileSet,
  });
}

function resolveRelativeImport(importerRelPath, spec, sourceFileSet) {
  const importerDir = path.posix.dirname(importerRelPath);
  const targetBase = path.posix.normalize(path.posix.join(importerDir, spec));
  return resolveSourceCandidate(targetBase, sourceFileSet);
}

function resolvePackageImport({ repoRoot, workspace, subpath, sourceFileSet }) {
  const exportedTarget = resolveExportTarget(workspace.packageJson.exports, subpath);
  const candidates = [];

  if (exportedTarget) {
    candidates.push(
      path.posix.normalize(path.posix.join(workspace.relRoot, exportedTarget)),
      path.posix.normalize(
        path.posix.join(workspace.relRoot, exportedTarget.replace(/^\.\/dist\//, "./src/")),
      ),
    );
  }

  if (subpath !== ".") {
    candidates.push(path.posix.join(workspace.relRoot, "src", subpath.slice(2)));
  } else {
    candidates.push(path.posix.join(workspace.relRoot, "src/index"));
  }

  for (const candidate of candidates) {
    const resolved = resolveSourceCandidate(candidate.replace(/^\.\//, ""), sourceFileSet);
    if (resolved) return resolved;
  }

  const packageMain = workspace.packageJson.main;
  if (packageMain) {
    return resolveSourceCandidate(path.posix.join(workspace.relRoot, packageMain), sourceFileSet);
  }

  return exists(path.join(repoRoot, workspace.relRoot, "src/index.ts"))
    ? path.posix.join(workspace.relRoot, "src/index.ts")
    : null;
}

function resolveExportTarget(exportsField, subpath) {
  if (!exportsField) return null;
  const entry = typeof exportsField === "string" ? exportsField : exportsField[subpath];

  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object") return null;

  if (typeof entry.types === "string") return entry.types;
  if (typeof entry.default === "string") return entry.default;
  if (typeof entry.import === "string") return entry.import;
  if (typeof entry.require === "string") return entry.require;

  return null;
}

function resolveSourceCandidate(candidate, sourceFileSet) {
  const normalized = candidate.replace(/\\/g, "/").replace(/^\.\//, "");

  if (sourceFileSet.has(normalized)) return normalized;

  if (sourceExtensions.includes(path.extname(normalized))) {
    const withoutExtension = normalized.slice(0, -path.extname(normalized).length);
    for (const extension of sourceExtensions) {
      const withMappedExtension = `${withoutExtension}${extension}`;
      if (sourceFileSet.has(withMappedExtension)) return withMappedExtension;
    }

    return null;
  }

  for (const extension of sourceExtensions) {
    const withExtension = `${normalized}${extension}`;
    if (sourceFileSet.has(withExtension)) return withExtension;
  }

  for (const extension of sourceExtensions) {
    const indexPath = path.posix.join(normalized, `index${extension}`);
    if (sourceFileSet.has(indexPath)) return indexPath;
  }

  return null;
}

function intentivePackageName(spec) {
  const match = spec.match(/^(@intentive\/[^/]+)/);
  return match?.[1] ?? null;
}

function buildReverseImports(modules) {
  const reverse = new Map();

  for (const file of modules.keys()) {
    reverse.set(file, new Set());
  }

  for (const [importer, module] of modules.entries()) {
    for (const imported of module.imports) {
      if (!reverse.has(imported)) reverse.set(imported, new Set());
      reverse.get(imported).add(importer);
    }
  }

  return reverse;
}

function collectBoundaryImports(modules) {
  const findings = [];

  for (const [file, module] of modules.entries()) {
    if (!module.workspace) continue;

    for (const imported of module.imports) {
      const targetWorkspace = modules.get(imported)?.workspace;
      if (!targetWorkspace) continue;
      if (targetWorkspace.relRoot === module.workspace.relRoot) continue;

      findings.push({
        from: file,
        fromWorkspace: module.workspace.relRoot,
        to: imported,
        toWorkspace: targetWorkspace.relRoot,
      });
    }
  }

  return findings.sort(compareByFields(["from", "to"]));
}

function collectTouchedPublicExports({
  repoRoot,
  workspaces,
  modules,
  sourceFileSet,
  changedSourceFiles,
}) {
  const changedSourceSet = new Set(changedSourceFiles);
  const publicFilesByWorkspace = new Map();

  for (const workspace of workspaces) {
    const entries = publicEntrypoints(repoRoot, workspace, sourceFileSet);
    const publicFiles = new Set(entries);

    for (const entry of entries) {
      followReExports(entry, modules, publicFiles);
    }

    publicFilesByWorkspace.set(workspace.relRoot, publicFiles);
  }

  const touched = [];

  for (const changedFile of changedSourceSet) {
    const module = modules.get(changedFile);
    if (!module?.workspace) continue;

    const publicFiles = publicFilesByWorkspace.get(module.workspace.relRoot);
    if (!publicFiles?.has(changedFile)) continue;

    touched.push({
      file: changedFile,
      workspace: module.workspace.relRoot,
      exports: module.exports,
    });
  }

  return touched.sort(compareByFields(["workspace", "file"]));
}

function publicEntrypoints(repoRoot, workspace, sourceFileSet) {
  const entries = new Set();
  const addTarget = (target) => {
    const relTarget = path.posix.normalize(path.posix.join(workspace.relRoot, target));
    const resolved = resolveSourceCandidate(relTarget.replace(/^\.\//, ""), sourceFileSet);
    if (resolved) entries.add(resolved);
  };

  const exportsField = workspace.packageJson.exports;
  if (typeof exportsField === "string") {
    addTarget(exportsField);
  } else if (exportsField && typeof exportsField === "object") {
    for (const entry of Object.values(exportsField)) {
      if (typeof entry === "string") {
        addTarget(entry);
      } else if (entry?.types) {
        addTarget(entry.types);
      } else if (entry?.default) {
        addTarget(entry.default);
      }
    }
  }

  addTarget("./src/index");
  return [...entries].sort();
}

function followReExports(file, modules, publicFiles) {
  const module = modules.get(file);
  if (!module) return;

  for (const target of module.reExports) {
    if (!target || publicFiles.has(target)) continue;
    publicFiles.add(target);
    followReExports(target, modules, publicFiles);
  }
}

function collectAffectedWorkspaces({
  workspaces,
  workspacesByName,
  modules,
  reverseImports,
  changedFiles,
  changedSourceFiles,
}) {
  const affected = new Map();
  const add = (workspaceRelRoot, reason) => {
    if (!workspaceRelRoot) return;
    if (!affected.has(workspaceRelRoot)) affected.set(workspaceRelRoot, new Set());
    affected.get(workspaceRelRoot).add(reason);
  };

  for (const changedFile of changedFiles) {
    add(workspaceForRelPath(workspaces, changedFile)?.relRoot, "changed file");
  }

  const queue = [...changedSourceFiles];
  const seenFiles = new Set(queue);

  for (const changedFile of changedSourceFiles) {
    add(modules.get(changedFile)?.workspace?.relRoot, "changed source");
  }

  while (queue.length > 0) {
    const file = queue.shift();
    for (const importer of reverseImports.get(file) ?? []) {
      if (!seenFiles.has(importer)) {
        seenFiles.add(importer);
        queue.push(importer);
      }

      add(modules.get(importer)?.workspace?.relRoot, `imports ${file}`);
    }
  }

  const changedWorkspaceNames = new Set();
  for (const changedFile of changedFiles) {
    const workspace = workspaceForRelPath(workspaces, changedFile);
    if (workspace?.name) changedWorkspaceNames.add(workspace.name);
  }

  const reverseWorkspaceDeps = buildReverseWorkspaceDeps(workspaces, workspacesByName);
  const workspaceQueue = [...changedWorkspaceNames];
  const seenWorkspaceNames = new Set(workspaceQueue);

  while (workspaceQueue.length > 0) {
    const workspaceName = workspaceQueue.shift();
    const dependents = reverseWorkspaceDeps.get(workspaceName) ?? [];

    for (const dependent of dependents) {
      add(dependent.relRoot, `depends on ${workspaceName}`);
      if (!seenWorkspaceNames.has(dependent.name)) {
        seenWorkspaceNames.add(dependent.name);
        workspaceQueue.push(dependent.name);
      }
    }
  }

  for (const changedFile of changedFiles) {
    const hint = loadBearingHintForPath(changedFile);
    if (!hint) continue;

    for (const workspaceRelRoot of hint.workspaces) {
      add(workspaceRelRoot, hint.reason);
    }
  }

  return [...affected.entries()]
    .map(([workspace, reasons]) => ({
      workspace,
      reasons: [...reasons].sort(),
    }))
    .sort(compareByFields(["workspace"]));
}

function buildReverseWorkspaceDeps(workspaces, workspacesByName) {
  const reverse = new Map();

  for (const workspace of workspaces) {
    const deps = {
      ...workspace.packageJson.dependencies,
      ...workspace.packageJson.devDependencies,
      ...workspace.packageJson.peerDependencies,
    };

    for (const depName of Object.keys(deps)) {
      if (!workspacesByName.has(depName)) continue;
      if (!reverse.has(depName)) reverse.set(depName, []);
      reverse.get(depName).push(workspace);
    }
  }

  for (const dependents of reverse.values()) {
    dependents.sort(compareByFields(["relRoot"]));
  }

  return reverse;
}

function loadBearingHintForPath(relPath) {
  for (const [prefix, workspaces] of loadBearingHints.entries()) {
    if (!relPath.startsWith(`${prefix}/`)) continue;
    return {
      workspaces,
      reason: `${prefix} review hint`,
    };
  }

  return null;
}

function getChangedFiles(repoRoot, base) {
  const diff = runGit(repoRoot, ["diff", "--name-only", "--diff-filter=ACMRTUXB", base, "--"]);
  const untracked = runGit(repoRoot, ["ls-files", "--others", "--exclude-standard"]);
  return [...new Set([...splitLines(diff), ...splitLines(untracked)])].sort();
}

function runGit(repoRoot, args) {
  const result = spawnSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  }

  return result.stdout;
}

function workspaceForPath(workspaces, relPath) {
  return workspaceForRelPath(workspaces, relPath);
}

function workspaceForRelPath(workspaces, relPath) {
  return (
    workspaces.find(
      (workspace) => relPath === workspace.relRoot || relPath.startsWith(`${workspace.relRoot}/`),
    ) ?? null
  );
}

export function formatReport(report) {
  const lines = [];

  lines.push("Impact Radius Sensor");
  lines.push(`Base: ${report.base}`);
  lines.push("");

  section(lines, "Changed files", report.changedFiles, (file) => `- ${file}`);

  section(lines, "Fan-in / fan-out", report.fan, (entry) => {
    return `- ${entry.file}: fan-in ${entry.fanIn}, fan-out ${entry.fanOut}`;
  });

  section(lines, "Boundary-crossing internal imports", report.boundaryImports, (entry) => {
    return `- ${entry.from} (${entry.fromWorkspace}) -> ${entry.to} (${entry.toWorkspace})`;
  });

  section(lines, "Touched public exports", report.publicExports, (entry) => {
    const exportsText =
      entry.exports.length > 0 ? entry.exports.join(", ") : "(no named exports detected)";
    return `- ${entry.file} (${entry.workspace}): ${exportsText}`;
  });

  section(lines, "Affected workspaces", report.affectedWorkspaces, (entry) => {
    return `- ${entry.workspace}: ${entry.reasons.join("; ")}`;
  });

  lines.push("");
  lines.push("Advisory: use this to steer review attention. It is not a quality score.");

  return lines.join("\n");
}

function section(lines, title, values, format) {
  lines.push(`## ${title}`);

  if (values.length === 0) {
    lines.push("- none");
  } else {
    for (const value of values) {
      lines.push(format(value));
    }
  }

  lines.push("");
}

function visit(node, callback) {
  if (!node || typeof node !== "object") return;

  callback(node);

  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue;

    if (Array.isArray(value)) {
      for (const child of value) {
        visit(child, callback);
      }
    } else if (value && typeof value === "object" && typeof value.type === "string") {
      visit(value, callback);
    }
  }
}

function isStringLiteral(node) {
  return node?.type === "Literal" && typeof node.value === "string";
}

function compareByFields(fields) {
  return (left, right) => {
    for (const field of fields) {
      const result = String(left[field]).localeCompare(String(right[field]));
      if (result !== 0) return result;
    }

    return 0;
  };
}

function splitLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function toRepoPath(repoRoot, absPath) {
  return path.relative(repoRoot, absPath).replace(/\\/g, "/");
}

function exists(absPath) {
  try {
    statSync(absPath);
    return true;
  } catch {
    return false;
  }
}

function isMainModule(metaUrl) {
  return process.argv[1] && fileURLToPath(metaUrl) === path.resolve(process.argv[1]);
}
