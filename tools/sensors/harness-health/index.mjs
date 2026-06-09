#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const parser = require("@typescript-eslint/parser");

const workspaceRoots = ["apps", "services", "packages"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".rs"]);
const jsSourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const ignoredDirectories = new Set([
  ".git",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
]);
const ignoredPathFragments = ["/reference/", "/ios/Pods/"];
const lineThresholds = { default: 250, rust: 400 };
const maxListItems = 20;

const contextFiles = [
  { owner: "System-wide", relPath: "CONTEXT-MAP.md" },
  { owner: "Shared", relPath: "packages/CONTEXT.md" },
  { owner: "Mobile Client", relPath: "apps/mobile/CONTEXT.md" },
  { owner: "Desktop Client", relPath: "apps/desktop/CONTEXT.md" },
  { owner: "Control Plane", relPath: "services/control-plane/CONTEXT.md" },
  { owner: "Agent Runtime", relPath: "services/agent-runtime/CONTEXT.md" },
];

// Technical phrases where an otherwise-forbidden term is a legitimate reference —
// an npm package name or a vendor's own product/API name — rather than product-
// language drift. A vocabulary finding is suppressed when the matched term falls
// entirely inside one of these phrases on the same line. Keep entries narrow so
// the sensor still catches real drift; this is an allowlist, not a mute button.
const vocabularyAllowlist = [
  /@assistant-ui[\w/-]*/i, // the assistant-ui runtime library
  /assistant[-\s]cloud/i, // the assistant-cloud integration the mobile app stubs out
  /neon\s+api/i, // Neon's REST API, distinct from our Control Plane
];

const usage = `Intentive harness health sensor

Builds an advisory review-triage report for a PR. Findings guide attention; they
are not a quality score and do not fail the sensor.

Usage:
  pnpm sensor:harness-health
  node tools/sensors/harness-health/index.mjs [--format markdown] [--base <ref>] [--repo <path>] [--output <path>]

Options:
  --format markdown  Output format. Only markdown is supported.
  --base <ref>       Git ref to compare against. Defaults to HEAD.
  --repo <path>      Repository root to analyze. Defaults to the current directory.
  --output <path>    Write the markdown report to this path as well as stdout.
  --help             Show this help.
`;

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage);
    process.exit(0);
  }

  const report = analyzeHarnessHealth(options);
  const output = formatMarkdownReport(report);
  if (options.output) {
    const outPath = path.resolve(options.repo, options.output);
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, output);
  }
  console.log(output);
} catch (error) {
  console.error(`harness-health: ${error.message}`);
  process.exit(1);
}

export function analyzeHarnessHealth({ repo = process.cwd(), base = "HEAD" } = {}) {
  const repoRoot = path.resolve(repo);
  const workspaces = discoverWorkspaces(repoRoot);
  const sourceFiles = listSourceFiles(repoRoot);
  const jsSourceFiles = sourceFiles.filter((file) => jsSourceExtensions.has(path.extname(file)));
  const testFiles = sourceFiles.filter(isTestFile);
  const changedFiles = getChangedFiles(repoRoot, base);
  const modules = buildModuleGraph(repoRoot, workspaces, jsSourceFiles);
  const reverseImports = buildReverseImports(modules);
  const publicExports = collectPublicExports(workspaces, modules, new Set(jsSourceFiles));
  const testText = collectTestText(repoRoot, testFiles);

  return {
    base,
    changedFiles,
    staleScaffolds: collectStaleScaffolds(repoRoot, sourceFiles),
    oversizedFiles: collectOversizedFiles(repoRoot, sourceFiles),
    highFanIn: collectHighFanIn(reverseImports),
    suppressions: collectSuppressions(repoRoot, sourceFiles),
    forbiddenTerms: collectForbiddenTerms(repoRoot, sourceFiles),
    dependencyFreshness: collectDependencyFreshness(repoRoot),
    untestedPublicExports: collectUntestedPublicExports(publicExports, testText),
  };
}

function parseArgs(args) {
  const options = {
    repo: process.cwd(),
    base: "HEAD",
    format: "markdown",
    output: null,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--format") {
      options.format = requireValue(args, index, arg);
      index += 1;
    } else if (arg === "--base") {
      options.base = requireValue(args, index, arg);
      index += 1;
    } else if (arg === "--repo") {
      options.repo = requireValue(args, index, arg);
      index += 1;
    } else if (arg === "--output") {
      options.output = requireValue(args, index, arg);
      index += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (options.format !== "markdown") throw new Error(`unsupported format: ${options.format}`);
  return options;
}

function requireValue(args, index, arg) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
  return value;
}

function discoverWorkspaces(repoRoot) {
  const workspaces = [];

  for (const root of workspaceRoots) {
    const absRoot = path.join(repoRoot, root);
    if (!existsSync(absRoot)) continue;

    for (const name of readdirSync(absRoot).sort()) {
      const relRoot = `${root}/${name}`;
      const packagePath = path.join(repoRoot, relRoot, "package.json");
      if (!existsSync(packagePath)) continue;

      const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
      workspaces.push({ relRoot, packageJson, name: packageJson.name ?? relRoot });
    }
  }

  return workspaces;
}

function listSourceFiles(repoRoot) {
  const files = [];

  for (const root of workspaceRoots) {
    const absRoot = path.join(repoRoot, root);
    if (existsSync(absRoot)) walk(absRoot, repoRoot, files);
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

    if (stat.isFile() && sourceExtensions.has(path.extname(relPath)) && !isIgnoredPath(relPath)) {
      files.push(relPath);
    }
  }
}

function collectStaleScaffolds(repoRoot, sourceFiles) {
  const findings = [];

  for (const file of sourceFiles) {
    const text = readFileSync(path.join(repoRoot, file), "utf8");
    const haystack = `${file}\n${text.slice(0, 2000)}`.toLowerCase();
    const reason = scaffoldReason(haystack);
    if (!reason) continue;

    findings.push({ file, kind: isTestFile(file) ? "test" : "source", reason });
  }

  return findings.sort(compareByFields(["kind", "file"]));
}

function scaffoldReason(haystack) {
  if (haystack.includes("scaffold")) return "scaffold marker";
  if (haystack.includes("placeholder")) return "placeholder marker";
  if (haystack.includes("starter")) return "starter marker";
  if (haystack.includes("todo")) return "todo marker";
  return null;
}

function collectOversizedFiles(repoRoot, sourceFiles) {
  const files = [];

  for (const file of sourceFiles) {
    const lineCount = readFileSync(path.join(repoRoot, file), "utf8").split(/\r?\n/).length;
    const threshold = file.endsWith(".rs") ? lineThresholds.rust : lineThresholds.default;
    if (lineCount > threshold) files.push({ file, lines: lineCount, threshold });
  }

  return files.sort(
    (left, right) => right.lines - left.lines || left.file.localeCompare(right.file),
  );
}

function buildModuleGraph(repoRoot, workspaces, sourceFiles) {
  const modules = new Map();
  const sourceFileSet = new Set(sourceFiles);
  const workspacesByName = new Map(workspaces.map((workspace) => [workspace.name, workspace]));

  for (const file of sourceFiles) {
    const ast = parseSource(readFileSync(path.join(repoRoot, file), "utf8"), file);
    const imports = [...new Set([...extractImportSpecs(ast), ...extractReExportSpecs(ast)])]
      .map((spec) => resolveImport({ spec, importer: file, sourceFileSet, workspacesByName }))
      .filter(Boolean);

    modules.set(file, {
      ast,
      imports,
      exports: collectExportNames(ast),
      reExports: extractReExportSpecs(ast)
        .map((spec) => resolveImport({ spec, importer: file, sourceFileSet, workspacesByName }))
        .filter(Boolean),
    });
  }

  return modules;
}

function buildReverseImports(modules) {
  const reverse = new Map();

  for (const file of modules.keys()) reverse.set(file, new Set());
  for (const [importer, module] of modules.entries()) {
    for (const imported of module.imports) {
      if (!reverse.has(imported)) reverse.set(imported, new Set());
      reverse.get(imported).add(importer);
    }
  }

  return reverse;
}

function collectHighFanIn(reverseImports) {
  return [...reverseImports.entries()]
    .map(([file, importers]) => ({ file, fanIn: importers.size }))
    .filter((entry) => entry.fanIn > 0)
    .sort((left, right) => right.fanIn - left.fanIn || left.file.localeCompare(right.file));
}

function collectSuppressions(repoRoot, sourceFiles) {
  const patterns = [
    { label: "eslint-disable", pattern: /eslint-disable/g },
    { label: "typescript suppression", pattern: /@ts-(?:ignore|expect-error)/g },
    { label: "rust allow attribute", pattern: /#\s*\[\s*allow\s*\(/g },
    {
      label: "audit/dependency ignore",
      pattern: /\b(?:ignore|ignored|allow)\s*:\s*RUSTSEC-|RUSTSEC-\d{4}-\d{4}/gi,
    },
    { label: "workflow continue-on-error", pattern: /continue-on-error:\s*true/g },
  ];
  const files = [...sourceFiles, ...listWorkflowFiles(repoRoot)];
  const findings = [];

  for (const file of files) {
    const lines = readFileSync(path.join(repoRoot, file), "utf8").split(/\r?\n/);
    for (const { label, pattern } of patterns) {
      for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
        pattern.lastIndex = 0;
        if (pattern.test(lines[lineNumber])) {
          findings.push({ file, line: lineNumber + 1, label });
        }
      }
    }
  }

  return findings.sort(compareByFields(["file", "line", "label"]));
}

function listWorkflowFiles(repoRoot) {
  const workflowRoot = path.join(repoRoot, ".github/workflows");
  if (!existsSync(workflowRoot)) return [];

  return readdirSync(workflowRoot)
    .filter((file) => /\.ya?ml$/.test(file))
    .sort()
    .map((file) => `.github/workflows/${file}`);
}

function collectForbiddenTerms(repoRoot, sourceFiles) {
  const terms = loadVocabularyTerms(repoRoot);
  const findings = [];

  for (const file of sourceFiles) {
    const applicableTerms = terms.filter((term) => appliesToFile(term, file));
    if (applicableTerms.length === 0) continue;

    const lines = stripUrls(readFileSync(path.join(repoRoot, file), "utf8")).split(/\r?\n/);
    for (const term of applicableTerms) {
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        term.pattern.lastIndex = 0;
        const match = term.pattern.exec(lines[lineIndex]);
        if (!match) continue;
        if (isVocabularyAllowlisted(lines[lineIndex], match)) continue;

        findings.push({
          file,
          line: lineIndex + 1,
          forbidden: match[0],
          canonical: term.canonical,
          owner: term.owner,
        });
        break;
      }
    }
  }

  return findings.sort(compareByFields(["file", "line", "forbidden"]));
}

function loadVocabularyTerms(repoRoot) {
  const terms = [];

  for (const contextFile of contextFiles) {
    const absPath = path.join(repoRoot, contextFile.relPath);
    if (!existsSync(absPath)) continue;

    let canonical = null;
    for (const rawLine of readFileSync(absPath, "utf8").split(/\r?\n/)) {
      const termMatch = rawLine.match(/^\*\*([^*]+)\*\*:/);
      if (termMatch) {
        canonical = termMatch[1].trim();
        continue;
      }

      const avoidMatch = rawLine.match(/^_Avoid_:\s*(.+)$/);
      if (!avoidMatch || !canonical) continue;

      for (const forbidden of avoidMatch[1].split(",").map((term) => term.trim())) {
        if (!forbidden) continue;
        terms.push({
          forbidden,
          canonical,
          owner: contextFile.owner,
          pattern: new RegExp(boundaryEscape(forbidden), "i"),
        });
      }
    }
  }

  return terms;
}

function collectDependencyFreshness(repoRoot) {
  const result = spawnSync("pnpm", ["outdated", "--recursive", "--format", "json"], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 30000,
  });

  if (!result.stdout.trim()) {
    return {
      available: false,
      reason: firstLine(result.stderr) || `pnpm outdated exited ${result.status ?? "unknown"}`,
      outdated: [],
    };
  }

  try {
    const parsed = JSON.parse(result.stdout);
    const entries = Array.isArray(parsed) ? parsed : Object.values(parsed).flat();
    return {
      available: true,
      reason: null,
      outdated: entries
        .map((entry) => ({
          packageName: entry.packageName ?? entry.name ?? entry.package ?? "(unknown)",
          current: entry.current ?? entry.currentVersion ?? "?",
          latest: entry.latest ?? entry.latestVersion ?? "?",
          workspace: entry.dependentPackageName ?? entry.path ?? entry.location ?? "workspace",
        }))
        .sort(compareByFields(["workspace", "packageName"])),
    };
  } catch (error) {
    return {
      available: false,
      reason: `could not parse pnpm outdated output: ${error.message}`,
      outdated: [],
    };
  }
}

function collectPublicExports(workspaces, modules, sourceFileSet) {
  const exports = [];

  for (const workspace of workspaces) {
    const publicFiles = new Set(publicEntrypoints(workspace, sourceFileSet));
    for (const entrypoint of [...publicFiles]) followReExports(entrypoint, modules, publicFiles);

    for (const file of [...publicFiles].sort()) {
      const module = modules.get(file);
      if (!module) continue;

      for (const exportName of module.exports) {
        exports.push({ workspace: workspace.relRoot, file, exportName });
      }
    }
  }

  return exports.sort(compareByFields(["workspace", "file", "exportName"]));
}

function collectUntestedPublicExports(publicExports, testText) {
  return publicExports.filter(
    (entry) => entry.exportName !== "default" && !testText.includes(entry.exportName),
  );
}

function collectTestText(repoRoot, testFiles) {
  return testFiles.map((file) => readFileSync(path.join(repoRoot, file), "utf8")).join("\n");
}

function publicEntrypoints(workspace, sourceFileSet) {
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
      } else if (entry?.import) {
        addTarget(entry.import);
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
    if (publicFiles.has(target)) continue;
    publicFiles.add(target);
    followReExports(target, modules, publicFiles);
  }
}

function parseSource(code, file) {
  try {
    return parser.parse(code, {
      comment: true,
      ecmaFeatures: { jsx: file.endsWith(".tsx") || file.endsWith(".jsx") },
      ecmaVersion: "latest",
      errorOnUnknownASTType: false,
      sourceType: "module",
    });
  } catch (error) {
    throw new Error(`failed to parse ${file}: ${error.message}`);
  }
}

function extractImportSpecs(ast) {
  const specs = [];
  visit(ast, (node) => {
    if (node.type === "ImportDeclaration" && isStringLiteral(node.source))
      specs.push(node.source.value);
    if (node.type === "ImportExpression" && isStringLiteral(node.source))
      specs.push(node.source.value);
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
    if (node.declaration) collectDeclarationNames(node.declaration, names);

    for (const specifier of node.specifiers ?? []) {
      if (specifier.exported?.name) names.add(specifier.exported.name);
    }
  }

  return [...names].sort();
}

function collectDeclarationNames(declaration, names) {
  if (declaration.id?.name) names.add(declaration.id.name);
  for (const declarator of declaration.declarations ?? []) {
    if (declarator.id?.name) names.add(declarator.id.name);
  }
}

function resolveImport({ spec, importer, sourceFileSet, workspacesByName }) {
  if (spec.startsWith(".")) {
    return resolveSourceCandidate(
      path.posix.normalize(path.posix.join(path.posix.dirname(importer), spec)),
      sourceFileSet,
    );
  }

  const packageName = intentivePackageName(spec);
  if (!packageName) return null;

  const workspace = workspacesByName.get(packageName);
  if (!workspace) return null;

  const subpath = spec.slice(packageName.length);
  const exportSubpath = subpath ? `.${subpath}` : ".";
  const exportedTarget = resolveExportTarget(workspace.packageJson.exports, exportSubpath);
  const candidates = [];

  if (exportedTarget) {
    candidates.push(
      path.posix.normalize(path.posix.join(workspace.relRoot, exportedTarget)),
      path.posix.normalize(
        path.posix.join(workspace.relRoot, exportedTarget.replace(/^\.\/dist\//, "./src/")),
      ),
    );
  }

  candidates.push(
    exportSubpath === "."
      ? path.posix.join(workspace.relRoot, "src/index")
      : path.posix.join(workspace.relRoot, "src", exportSubpath.slice(2)),
  );

  for (const candidate of candidates) {
    const resolved = resolveSourceCandidate(candidate.replace(/^\.\//, ""), sourceFileSet);
    if (resolved) return resolved;
  }

  return null;
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
  if (jsSourceExtensions.has(path.extname(normalized))) {
    const withoutExtension = normalized.slice(0, -path.extname(normalized).length);
    for (const extension of jsSourceExtensions) {
      const mapped = `${withoutExtension}${extension}`;
      if (sourceFileSet.has(mapped)) return mapped;
    }
    return null;
  }

  for (const extension of jsSourceExtensions) {
    const withExtension = `${normalized}${extension}`;
    if (sourceFileSet.has(withExtension)) return withExtension;
  }
  for (const extension of jsSourceExtensions) {
    const indexPath = path.posix.join(normalized, `index${extension}`);
    if (sourceFileSet.has(indexPath)) return indexPath;
  }

  return null;
}

function getChangedFiles(repoRoot, base) {
  const diff = runGit(repoRoot, ["diff", "--name-only", "--diff-filter=ACMRTUXB", base, "--"]);
  const untracked = runGit(repoRoot, ["ls-files", "--others", "--exclude-standard"]);
  return [...new Set([...splitLines(diff), ...splitLines(untracked)])].sort();
}

function runGit(repoRoot, args) {
  const result = spawnSync("git", ["-C", repoRoot, ...args], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout;
}

function formatMarkdownReport(report) {
  const lines = [];

  lines.push("<!-- intentive:harness-health -->");
  lines.push("## Harness Health");
  lines.push("");
  lines.push(`Base: \`${report.base}\``);
  lines.push("");
  section(lines, "Changed Files", report.changedFiles, (file) => `- \`${file}\``);
  section(lines, "Stale Scaffold Tests And Sources", report.staleScaffolds, (entry) => {
    return `- \`${entry.file}\` (${entry.kind}, ${entry.reason})`;
  });
  section(lines, "Files Over Threshold", report.oversizedFiles, (entry) => {
    return `- \`${entry.file}\`: ${entry.lines} lines (threshold ${entry.threshold})`;
  });
  section(lines, "Highest Fan-In Modules", report.highFanIn, (entry) => {
    return `- \`${entry.file}\`: fan-in ${entry.fanIn}`;
  });
  section(lines, "Architecture Suppressions", report.suppressions, (entry) => {
    return `- \`${entry.file}:${entry.line}\`: ${entry.label}`;
  });
  section(lines, "Forbidden Vocabulary Hits", report.forbiddenTerms, (entry) => {
    return `- \`${entry.file}:${entry.line}\`: "${entry.forbidden}" -> "${entry.canonical}" (${entry.owner})`;
  });
  dependencySection(lines, report.dependencyFreshness);
  section(lines, "Untested Public Exports", report.untestedPublicExports, (entry) => {
    return `- \`${entry.exportName}\` from \`${entry.file}\` (${entry.workspace})`;
  });
  lines.push("");
  lines.push("Advisory: use this report to steer review attention. It is not a quality score.");

  return lines.join("\n");
}

function section(lines, title, values, format) {
  lines.push(`### ${title}`);

  if (values.length === 0) {
    lines.push("- none");
  } else {
    for (const value of values.slice(0, maxListItems)) lines.push(format(value));
    if (values.length > maxListItems) lines.push(`- ...and ${values.length - maxListItems} more`);
  }

  lines.push("");
}

function dependencySection(lines, freshness) {
  lines.push("### Dependency Freshness");

  if (!freshness.available) {
    lines.push(`- not available: ${freshness.reason}`);
  } else if (freshness.outdated.length === 0) {
    lines.push("- no outdated direct dependencies reported");
  } else {
    for (const entry of freshness.outdated.slice(0, maxListItems)) {
      lines.push(
        `- \`${entry.packageName}\` in ${entry.workspace}: ${entry.current} -> ${entry.latest}`,
      );
    }
    if (freshness.outdated.length > maxListItems) {
      lines.push(`- ...and ${freshness.outdated.length - maxListItems} more`);
    }
  }

  lines.push("");
}

function appliesToFile(term, relPath) {
  if (term.owner === "System-wide" || term.owner === "Shared") return true;
  if (term.owner === "Mobile Client") return relPath.startsWith("apps/mobile/");
  if (term.owner === "Desktop Client") return relPath.startsWith("apps/desktop/");
  if (term.owner === "Control Plane") return relPath.startsWith("services/control-plane/");
  if (term.owner === "Agent Runtime") return relPath.startsWith("services/agent-runtime/");
  return false;
}

function boundaryEscape(term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startsWord = /^\w/.test(term);
  const endsWord = /\w$/.test(term);
  const suffix = term.toLowerCase() === "the agent" ? "(?!\\s+Runtime)" : "";
  return `${startsWord ? "(?<![\\w-])" : ""}${escaped}${endsWord ? "(?![\\w-])" : ""}${suffix}`;
}

function isVocabularyAllowlisted(line, match) {
  const start = match.index;
  const end = match.index + match[0].length;
  for (const phrase of vocabularyAllowlist) {
    const flags = phrase.flags.includes("g") ? phrase.flags : `${phrase.flags}g`;
    const scan = new RegExp(phrase.source, flags);
    for (let m = scan.exec(line); m; m = scan.exec(line)) {
      if (m.index <= start && m.index + m[0].length >= end) return true;
      if (scan.lastIndex === m.index) scan.lastIndex += 1;
    }
  }
  return false;
}

function intentivePackageName(spec) {
  const match = spec.match(/^(@intentive\/[^/]+)/);
  return match?.[1] ?? null;
}

function isTestFile(file) {
  return /(?:^|\/)(?:__tests__|test|tests)\//.test(file) || /\.(?:test|spec)\.[^.]+$/.test(file);
}

function isIgnoredPath(relPath) {
  const normalized = `/${relPath.replace(/\\/g, "/")}`;
  return ignoredPathFragments.some((fragment) => normalized.includes(fragment));
}

function stripUrls(value) {
  return value.replace(/https?:\/\/\S+/g, "");
}

function firstLine(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)[0];
}

function splitLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function visit(node, callback) {
  if (!node || typeof node !== "object") return;
  callback(node);

  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue;
    if (Array.isArray(value)) {
      for (const child of value) visit(child, callback);
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

function toRepoPath(repoRoot, absPath) {
  return path.relative(repoRoot, absPath).replace(/\\/g, "/");
}
