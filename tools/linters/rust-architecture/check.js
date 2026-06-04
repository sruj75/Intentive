#!/usr/bin/env node
"use strict";

// Custom layer-architecture checker for Rust (Tauri desktop). ESLint only
// parses TS/JS, so the same layered-domain rules enforced for the frontend are
// applied to `.rs` here, sharing the layer order from the ESLint plugin.
//
//   node tools/linters/rust-architecture/check.js            # advisory (always exit 0)
//   node tools/linters/rust-architecture/check.js --strict   # hard gate (exit 1 on any violation)
//
// Scans every `apps/*/src-tauri/src/` tree it finds under the repo root.

const fs = require("node:fs");
const path = require("node:path");
const { checkSource } = require("./lib/check-source");
const { structuralMessage, structuralViolations } = require("./lib/check-structure");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const strict = process.argv.includes("--strict");

/** Recursively collect `.rs` files under a directory, skipping build output. */
function collectRustFiles(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === "target" || entry.name === "gen") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectRustFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".rs")) {
      out.push(full);
    }
  }
  return out;
}

// Find each apps/<name>/src-tauri/src directory present in the repo.
function findRustSrcDirs() {
  const appsDir = path.join(REPO_ROOT, "apps");
  const dirs = [];
  let apps;
  try {
    apps = fs.readdirSync(appsDir, { withFileTypes: true });
  } catch {
    return dirs;
  }
  for (const app of apps) {
    if (!app.isDirectory()) continue;
    const src = path.join(appsDir, app.name, "src-tauri", "src");
    if (fs.existsSync(src)) dirs.push(src);
  }
  return dirs;
}

const findings = [];

for (const srcDir of findRustSrcDirs()) {
  // Structural check: only lib.rs / main.rs / domains/ / providers/ allowed at src/ root.
  const topLevel = fs
    .readdirSync(srcDir, { withFileTypes: true })
    .map((e) => e.name)
    .filter((n) => n !== "target" && n !== "gen");
  for (const offender of structuralViolations(topLevel)) {
    findings.push({
      file: path.relative(REPO_ROOT, path.join(srcDir, offender)),
      line: 0,
      message: structuralMessage(offender),
    });
  }

  // Per-file layer-direction + cross-domain checks.
  for (const file of collectRustFiles(srcDir, [])) {
    const source = fs.readFileSync(file, "utf8");
    for (const v of checkSource({ filePath: file, source })) {
      findings.push({ file: path.relative(REPO_ROOT, file), line: v.line, message: v.message });
    }
  }
}

if (findings.length === 0) {
  console.log("rust-architecture: no violations.");
  process.exit(0);
}

const label = strict ? "error" : "warning (advisory)";
for (const f of findings) {
  console.error(`[${label}] ${f.file}:${f.line}\n  ${f.message}\n`);
}
console.error(`rust-architecture: ${findings.length} violation(s).`);
process.exit(strict ? 1 : 0);
