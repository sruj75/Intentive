#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";

const maxStagedFileBytes = 500 * 1024;
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);

const repoRoot = git(["rev-parse", "--show-toplevel"]).trim();
process.chdir(repoRoot);

const branch = git(["branch", "--show-current"]).trim();
if (branch === "main" || branch === "master") {
  fail(`refusing to commit directly on ${branch}; create a topic branch first`);
}

const diffCheck = spawnGit(["diff", "--cached", "--check"]);
if (diffCheck.status !== 0) {
  failOutput("staged diff has whitespace errors or conflict markers", diffCheck);
}

const stagedFiles = splitNul(git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]));

if (stagedFiles.length === 0) {
  console.log("check-staged: no added, copied, modified, or renamed files staged");
  process.exit(0);
}

const violations = [];

for (const file of stagedFiles) {
  const blob = stagedBlobFor(file);
  if (!blob) continue;

  const size = Number(git(["cat-file", "-s", blob]));
  if (size > maxStagedFileBytes) {
    violations.push(
      `${file} is ${formatBytes(size)}; keep committed files <= ${formatBytes(maxStagedFileBytes)}`,
    );
  }

  if (sourceExtensions.has(path.extname(file))) {
    const content = git(["cat-file", "-p", blob], { encoding: "utf8" });
    const debuggerLine = firstMatchingLine(content, /^\s*debugger\s*;?(?:\s*\/\/.*)?$/);
    if (debuggerLine) {
      violations.push(`${file}:${debuggerLine.number} contains debugger`);
    }
  }
}

if (violations.length > 0) {
  fail(
    `staged safety checks failed:\n${violations.map((violation) => `- ${violation}`).join("\n")}`,
  );
}

console.log("check-staged: staged safety checks passed");

function stagedBlobFor(file) {
  const indexEntry = git(["ls-files", "-s", "--", file]).trim();
  if (!indexEntry) return null;

  const [, blob] = indexEntry.match(/^\d+\s+([0-9a-f]+)\s+\d+\t/) ?? [];
  return blob ?? null;
}

function firstMatchingLine(content, pattern) {
  const lines = content.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (pattern.test(line)) {
      return { number: index + 1, text: line };
    }
  }

  return null;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  return `${Math.round(bytes / 1024)}KB`;
}

function splitNul(output) {
  if (!output) return [];
  return output.split("\0").filter(Boolean);
}

function git(args, options = {}) {
  const result = spawnGit(args, options);
  if (result.status !== 0) {
    failOutput(`git ${args.join(" ")} failed`, result);
  }

  return result.stdout;
}

function spawnGit(args, options = {}) {
  return spawnSync("git", args, {
    encoding: options.encoding ?? "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

function failOutput(message, result) {
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  fail(output ? `${message}\n${output}` : message);
}

function fail(message) {
  console.error(`check-staged: ${message}`);
  process.exit(1);
}
