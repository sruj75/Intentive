#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const rootChecks = [
  { label: "Typecheck", command: "pnpm", args: ["typecheck"] },
  { label: "Lint", command: "pnpm", args: ["lint"] },
  { label: "Format check", command: "pnpm", args: ["format:check"] },
  { label: "Harness template fixture tests", command: "pnpm", args: ["harness:test"] },
  { label: "CONTEXT vocabulary docs tests", command: "pnpm", args: ["docs:context:test"] },
  { label: "Agent docs integrity tests", command: "pnpm", args: ["docs:agents:test"] },
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
    label: "Harness health sensor fixture tests",
    command: "pnpm",
    args: ["sensor:harness-health:test"],
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

const harnessDir = path.dirname(fileURLToPath(import.meta.url));
const scopeTemplateFiles = [
  "mobile.json",
  "desktop.json",
  "control-plane.json",
  "agent-runtime.json",
];

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`Harness failed: ${error.message}`);
  process.exit(1);
}

const usage = `Intentive harness

Runs the root pre-handoff verification suite:

${rootChecks.map((check, index) => `  ${index + 1}. ${formatCommand(check)}`).join("\n")}

Scoped harnesses print the deployable guide, then run the commands and sensors
from tools/harness/<deployable>.json.

Usage:
  pnpm harness
  pnpm harness --scope apps/mobile
  pnpm harness --scope services/agent-runtime
  node tools/harness/run-harness.mjs

Options:
  --scope <scope>  Run a deployable-scoped harness template.
  --list-scopes    Print configured harness scopes.
  --dry-run        Print the selected guide and commands without running them.
  --help           Show this help.
`;

if (args.help) {
  console.log(usage);
  process.exit(0);
}

const scopeTemplates = await loadScopeTemplates();

if (args.listScopes) {
  for (const template of scopeTemplates) {
    console.log(`${template.scope} (${template.aliases.join(", ")})`);
  }
  process.exit(0);
}

const startedAt = performance.now();

try {
  const harness = args.scope
    ? selectScopedHarness(args.scope, scopeTemplates)
    : {
        name: "Root",
        checks: rootChecks,
      };

  if (harness.template) {
    printScopeGuide(harness.template);
  }

  const checks = harness.checks;
  for (const [index, check] of checks.entries()) {
    printHeader(index, check, checks.length);
    if (args.dryRun) {
      continue;
    }

    const result = await runCheck(check);

    if (result.exitCode !== 0) {
      const elapsed = formatElapsed(performance.now() - startedAt);
      console.error(`\nHarness failed after ${elapsed}: ${check.label}`);
      process.exit(result.exitCode);
    }
  }

  const elapsed = formatElapsed(performance.now() - startedAt);
  const suffix = args.dryRun ? "dry run completed" : "passed";
  console.log(`\n${harness.name} harness ${suffix} in ${elapsed}.`);
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

function printHeader(index, check, total) {
  const number = `${index + 1}/${total}`;
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

async function loadScopeTemplates() {
  return Promise.all(
    scopeTemplateFiles.map(async (fileName) => {
      const filePath = path.join(harnessDir, fileName);
      const parsed = JSON.parse(await readFile(filePath, "utf8"));
      validateTemplate(parsed, fileName);
      return parsed;
    }),
  );
}

function validateTemplate(template, fileName) {
  const requiredFields = [
    "name",
    "scope",
    "aliases",
    "owningContextDocs",
    "adrDirs",
    "requiredCommands",
    "sensors",
    "highRiskSharedPackages",
    "commonFailureModes",
  ];

  for (const field of requiredFields) {
    if (!template[field]) {
      throw new Error(`${fileName} is missing ${field}`);
    }
  }

  const commands = [...template.sensors, ...template.requiredCommands];
  for (const command of commands) {
    if (!command.label || !command.command || !Array.isArray(command.args)) {
      throw new Error(`${fileName} contains an invalid command entry`);
    }
  }
}

function selectScopedHarness(scope, templates) {
  const template = templates.find((candidate) => {
    return candidate.scope === scope || candidate.aliases.includes(scope);
  });

  if (!template) {
    const scopes = templates.map((candidate) => candidate.scope).join(", ");
    throw new Error(`Unknown harness scope "${scope}". Available scopes: ${scopes}`);
  }

  return {
    name: template.name,
    template,
    checks: [...template.sensors, ...template.requiredCommands],
  };
}

function printScopeGuide(template) {
  console.log(`\n# ${template.name} Harness`);
  console.log(`Scope: ${template.scope}`);
  printList("Context docs", template.owningContextDocs);
  printList("ADR dirs", template.adrDirs);
  printList("High-risk shared packages", template.highRiskSharedPackages);
  printList("Common failure modes", template.commonFailureModes);

  if (template.reviewHints?.length) {
    printList("Review hints", template.reviewHints);
  }
}

function printList(label, values) {
  console.log(`\n${label}:`);
  for (const value of values) {
    console.log(`  - ${value}`);
  }
}

function parseArgs(rawArgs) {
  const parsed = {
    dryRun: false,
    help: false,
    listScopes: false,
    scope: null,
  };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }

    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }

    if (arg === "--list-scopes") {
      parsed.listScopes = true;
      continue;
    }

    if (arg === "--scope") {
      const value = rawArgs[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--scope requires a value");
      }

      parsed.scope = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return parsed;
}
