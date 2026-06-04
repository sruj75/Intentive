#!/usr/bin/env node

import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";

const checks = [
  { label: "Typecheck", command: "pnpm", args: ["typecheck"] },
  { label: "Lint", command: "pnpm", args: ["lint"] },
  { label: "Format check", command: "pnpm", args: ["format:check"] },
  { label: "Architecture lint plugin tests", command: "pnpm", args: ["lint:architecture:test"] },
  {
    label: "Architecture lint (Rust layer + structure)",
    command: "pnpm",
    args: ["lint:architecture:rust"],
  },
  {
    label: "Impact radius sensor fixture tests",
    command: "pnpm",
    args: ["sensor:impact-radius:test"],
  },
  {
    label: "Contract drift sensor",
    command: "pnpm",
    args: ["sensor:contract-drift"],
  },
  {
    label: "Contract drift sensor fixture tests",
    command: "pnpm",
    args: ["sensor:contract-drift:test"],
  },
  { label: "Workspace tests", command: "pnpm", args: ["test"] },
  {
    label: "Mobile React Native tests",
    command: "pnpm",
    args: ["--dir", "apps/mobile", "test:rn"],
  },
];

const usage = `Intentive harness

Runs the root pre-handoff verification suite:

${checks.map((check, index) => `  ${index + 1}. ${formatCommand(check)}`).join("\n")}

Usage:
  pnpm harness
  node tools/harness/run-harness.mjs
`;

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(usage);
  process.exit(0);
}

const startedAt = performance.now();

try {
  for (const [index, check] of checks.entries()) {
    printHeader(index, check);
    const result = await runCheck(check);

    if (result.exitCode !== 0) {
      const elapsed = formatElapsed(performance.now() - startedAt);
      console.error(`\nHarness failed after ${elapsed}: ${check.label}`);
      process.exit(result.exitCode);
    }
  }

  const elapsed = formatElapsed(performance.now() - startedAt);
  console.log(`\nHarness passed in ${elapsed}.`);
} catch (error) {
  const elapsed = formatElapsed(performance.now() - startedAt);
  console.error(`\nHarness failed after ${elapsed}: ${error.message}`);
  process.exit(1);
}

function runCheck(check) {
  return new Promise((resolve, reject) => {
    const child = spawn(check.command, check.args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (exitCode, signal) => {
      if (signal) {
        resolve({ exitCode: 1 });
        return;
      }

      resolve({ exitCode: exitCode ?? 1 });
    });
  });
}

function printHeader(index, check) {
  const number = `${index + 1}/${checks.length}`;
  console.log(`\n=== ${number} ${check.label} ===`);
  console.log(`$ ${formatCommand(check)}\n`);
}

function formatCommand(check) {
  return [check.command, ...check.args].join(" ");
}

function formatElapsed(milliseconds) {
  const totalSeconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}
