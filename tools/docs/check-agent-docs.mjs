#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ignoredDirs = new Set([
  ".git",
  ".turbo",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".expo",
  "target",
]);

const allowedNestedAgentDocs = new Set(["services/agent-runtime/reference/AGENTS.md"]);

const usage = `Intentive agent-docs checker

Checks the structural contracts for AGENTS.md / CLAUDE.md instruction files.

Usage:
  node tools/docs/check-agent-docs.mjs [--repo <path>]
`;

export async function checkAgentDocs({ repoRoot = process.cwd() } = {}) {
  const failures = [];
  const rootAgents = "AGENTS.md";
  const rootAgentsPath = path.join(repoRoot, rootAgents);
  const rootContent = await readRequiredFile(rootAgentsPath, rootAgents, failures);

  const agentDocs = await findNamedFiles(repoRoot, "AGENTS.md");
  const claudeDocs = await findNamedFiles(repoRoot, "CLAUDE.md");
  const deployables = await listStableChildren(repoRoot, ["apps", "services"]);
  const packages = await listStableChildren(repoRoot, ["packages"]);
  const scopedAgentDocs = [
    ...deployables.map((dir) => `${dir}/AGENTS.md`),
    "packages/AGENTS.md",
  ].sort();
  const allowedAgentDocs = new Set([rootAgents, ...scopedAgentDocs, ...allowedNestedAgentDocs]);

  if (!agentDocs.includes(rootAgents)) {
    failures.push("AGENTS.md missing at repository root");
  }

  for (const relPath of agentDocs) {
    if (!allowedAgentDocs.has(relPath)) {
      failures.push(
        `${relPath} sits outside the allowed instruction boundaries. ` +
          `Allowed boundaries are root, direct apps/services, packages/, and ` +
          `${[...allowedNestedAgentDocs].join(", ")}.`,
      );
    }
  }

  if (rootContent !== null) {
    for (const relPath of scopedAgentDocs) {
      assertMarkdownLinksTo({
        fromRelPath: rootAgents,
        fromContent: rootContent,
        targetRelPath: relPath,
        failures,
      });
    }

    assertRootTableMatches({
      rootContent,
      kind: "deployable",
      expectedDirs: deployables,
      allowedPrefixes: ["apps/", "services/"],
      failures,
    });
    assertRootTableMatches({
      rootContent,
      kind: "shared package",
      expectedDirs: packages,
      allowedPrefixes: ["packages/"],
      failures,
    });
  }

  for (const relPath of agentDocs) {
    if (relPath === rootAgents) continue;

    const content = await readRequiredFile(path.join(repoRoot, relPath), relPath, failures);
    if (content === null) continue;

    assertMarkdownLinksTo({
      fromRelPath: relPath,
      fromContent: content,
      targetRelPath: rootAgents,
      failures,
    });
  }

  for (const relPath of claudeDocs) {
    const content = await readRequiredFile(path.join(repoRoot, relPath), relPath, failures);
    if (content === null) continue;

    if (content.trim() !== "@AGENTS.md") {
      failures.push(`${relPath} must contain exactly one pointer line: @AGENTS.md`);
    }
  }

  return {
    agentDocsChecked: agentDocs.length,
    claudeDocsChecked: claudeDocs.length,
    failures,
  };
}

async function readRequiredFile(absPath, relPath, failures) {
  try {
    return await readFile(absPath, "utf8");
  } catch {
    failures.push(`${relPath} missing`);
    return null;
  }
}

async function findNamedFiles(repoRoot, fileName) {
  const results = [];

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".github") {
        continue;
      }

      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) continue;
        await walk(path.join(dir, entry.name));
        continue;
      }

      if (entry.isFile() && entry.name === fileName) {
        results.push(toPosix(path.relative(repoRoot, path.join(dir, entry.name))));
      }
    }
  }

  await walk(repoRoot);
  return results.sort();
}

async function listStableChildren(repoRoot, parentDirs) {
  const children = [];

  for (const parentDir of parentDirs) {
    const absParent = path.join(repoRoot, parentDir);
    let entries = [];
    try {
      entries = await readdir(absParent, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || ignoredDirs.has(entry.name)) {
        continue;
      }
      children.push(`${parentDir}/${entry.name}`);
    }
  }

  return children.sort();
}

function assertMarkdownLinksTo({ fromRelPath, fromContent, targetRelPath, failures }) {
  const targetVariants = markdownLinkTargetVariants(fromRelPath, targetRelPath);
  const linkedTargets = extractMarkdownTargets(fromContent);

  if (![...targetVariants].some((target) => linkedTargets.has(target))) {
    failures.push(`${fromRelPath} must link to ${targetRelPath}`);
  }
}

function markdownLinkTargetVariants(fromRelPath, targetRelPath) {
  const fromDir = path.posix.dirname(fromRelPath);
  const relativeTarget =
    fromDir === "."
      ? targetRelPath
      : path.posix.relative(fromDir, targetRelPath) || path.posix.basename(targetRelPath);

  return new Set([targetRelPath, `./${targetRelPath}`, relativeTarget, `./${relativeTarget}`]);
}

function extractMarkdownTargets(content) {
  const targets = new Set();
  const linkPattern = /(?<!!)\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match;

  while ((match = linkPattern.exec(content)) !== null) {
    const rawTarget = match[1]?.trim();
    if (!rawTarget || rawTarget.startsWith("http://") || rawTarget.startsWith("https://")) {
      continue;
    }
    targets.add(rawTarget.split("#")[0]);
  }

  return targets;
}

function assertRootTableMatches({ rootContent, kind, expectedDirs, allowedPrefixes, failures }) {
  const sectionContent =
    kind === "deployable"
      ? extractHeadingSection(rootContent, "The four deployables")
      : extractHeadingSection(rootContent, "The shared packages");
  const rootTargets = [...extractMarkdownTargets(sectionContent)]
    .filter((target) => allowedPrefixes.some((prefix) => target.startsWith(prefix)))
    .map((target) => target.replace(/\/AGENTS\.md$/, "").replace(/\/$/, ""))
    .filter((target) => expectedDirs.some((expected) => target === expected));
  const actualDirs = [...new Set(rootTargets)].sort();

  const missing = expectedDirs.filter((expected) => !actualDirs.includes(expected));
  const extra = actualDirs.filter((actual) => !expectedDirs.includes(actual));

  if (missing.length > 0 || extra.length > 0) {
    failures.push(
      `root AGENTS.md ${kind} table drift. ` +
        `Expected: ${expectedDirs.join(", ") || "(none)"}. ` +
        `Found: ${actualDirs.join(", ") || "(none)"}.`,
    );
  }
}

function extractHeadingSection(content, headingText) {
  const lines = content.split(/\r?\n/);
  const headingPattern = new RegExp(`^##\\s+${escapeRegExp(headingText)}\\s*$`);
  let start = -1;

  for (let index = 0; index < lines.length; index += 1) {
    if (headingPattern.test(lines[index])) {
      start = index + 1;
      break;
    }
  }

  if (start === -1) {
    return "";
  }

  let end = lines.length;
  for (let index = start; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      end = index;
      break;
    }
  }

  return lines.slice(start, end).join("\n");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toPosix(value) {
  return value.split(path.sep).join(path.posix.sep);
}

function parseArgs(args) {
  const options = { repoRoot: process.cwd(), help: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--repo") {
      options.repoRoot = requireValue(args, index, arg);
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage);
    return;
  }

  const result = await checkAgentDocs({ repoRoot: options.repoRoot });
  if (result.failures.length > 0) {
    console.error("Agent-docs check failed:\n");
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(
    `Agent-docs check passed (${result.agentDocsChecked} AGENTS.md files, ` +
      `${result.claudeDocsChecked} CLAUDE.md files scanned).`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Agent-docs check crashed:", error);
    process.exit(1);
  });
}
