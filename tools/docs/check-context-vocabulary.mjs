#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

const defaultContextFiles = [
  "CONTEXT-MAP.md",
  "packages/CONTEXT.md",
  "apps/mobile/CONTEXT.md",
  "apps/desktop/CONTEXT.md",
  "services/control-plane/CONTEXT.md",
  "services/agent-runtime/CONTEXT.md",
];

const bareImplementationNames = new Set([
  "APNs",
  "Better Auth",
  "Cloud Run",
  "DeepAgents",
  "Expo",
  "GCE",
  "LangGraph",
  "Neon Auth",
  "ScreenPipe",
  "SQLite",
  "Tauri",
]);

const usage = `Intentive CONTEXT vocabulary checker

Checks CONTEXT.md _Avoid_ lines for bare implementation names. Avoid terms
should name product/domain drift (for example, "Expo app"), not exact framework
or vendor names that source comments may need to reference accurately.

Usage:
  node tools/docs/check-context-vocabulary.mjs [--repo <path>]
`;

export async function checkContextVocabulary({
  repoRoot = process.cwd(),
  contextFiles = defaultContextFiles,
} = {}) {
  const failures = [];

  for (const relPath of contextFiles) {
    const absPath = path.join(repoRoot, relPath);
    const lines = (await readFile(absPath, "utf8")).split(/\r?\n/);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      const match = line.match(/^_Avoid_:\s*(.+)$/);
      if (!match) continue;

      for (const term of splitAvoidTerms(match[1])) {
        if (!bareImplementationNames.has(term)) continue;

        failures.push(
          `${relPath}:${lineIndex + 1} _Avoid_ uses bare implementation name "${term}". ` +
            `Use a product-alias phrase instead, such as "${term} app", when that is the actual drift.`,
        );
      }
    }
  }

  return { checkedFiles: contextFiles.length, failures };
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

function splitAvoidTerms(value) {
  return value
    .split(",")
    .map((term) => term.replace(/\([^)]*\)/g, "").trim())
    .filter(Boolean);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage);
    return;
  }

  const result = await checkContextVocabulary({ repoRoot: options.repoRoot });
  if (result.failures.length > 0) {
    console.error("CONTEXT vocabulary check failed:\n");
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(`CONTEXT vocabulary check passed (${result.checkedFiles} context files scanned).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("CONTEXT vocabulary check crashed:", error);
    process.exit(1);
  });
}
