#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readLedger } from "./ledger.mjs";
import { parseReportContext, parseReportInput } from "./parse-report.mjs";
import { buildRecommendations, formatRecommendationsMarkdown } from "./recommend.mjs";

const usage = `Intentive factory recommendations

Reads a factory report, compares it against the ledger, and writes recommendation-only output.
This command does not edit tracked files except the generated recommendations file.

Usage:
  pnpm factory:recommend --report factory-report.md
  node tools/factory/recommend-cli.mjs --report <path> [--ledger <path>] [--output <path>] [--repo <path>]

Options:
  --report <path>   Factory report markdown file or sticky comment copy. Required.
  --ledger <path>   Ledger file path. Defaults to docs/factory/LEDGER.md.
  --output <path>   Output path. Defaults to .context/factory-recommendations.md.
  --repo <path>     Repository root. Defaults to the current directory.
  --help            Show this help.
`;

if (isMainModule(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage);
      process.exit(0);
    }

    const reportPath = path.resolve(options.repo, options.report);
    const content = readFileSync(reportPath, "utf8");
    const findings = parseReportInput({ content });
    const reportContext = parseReportContext(content);
    const ledger = readLedgerSafe(path.resolve(options.repo, options.ledger));
    const recommendations = buildRecommendations({
      findings,
      ledgerEntries: ledger.entries,
      changedFiles: reportContext.changedFiles,
    });
    const output = formatRecommendationsMarkdown(recommendations, {
      source: path.relative(options.repo, reportPath),
    });
    const outputPath = path.resolve(options.repo, options.output);

    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, output);
    console.log(
      `Wrote ${path.relative(options.repo, outputPath)} (${recommendations.length} recommendation(s))`,
    );
  } catch (error) {
    console.error(`factory:recommend: ${error.message}`);
    process.exit(1);
  }
}

function parseArgs(args) {
  const options = {
    repo: process.cwd(),
    report: null,
    ledger: "docs/factory/LEDGER.md",
    output: ".context/factory-recommendations.md",
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--repo") {
      options.repo = requireValue(args, index, arg);
      index += 1;
    } else if (arg === "--report") {
      options.report = requireValue(args, index, arg);
      index += 1;
    } else if (arg === "--ledger") {
      options.ledger = requireValue(args, index, arg);
      index += 1;
    } else if (arg === "--output") {
      options.output = requireValue(args, index, arg);
      index += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (!options.report) {
    throw new Error("--report is required");
  }

  return options;
}

function requireValue(args, index, arg) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
  return value;
}

function readLedgerSafe(ledgerPath) {
  try {
    return readLedger(ledgerPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return { entries: {}, updatedAt: null };
    }
    throw error;
  }
}

function isMainModule(metaUrl) {
  return process.argv[1] && fileURLToPath(metaUrl) === path.resolve(process.argv[1]);
}

export { parseArgs, readLedgerSafe };
