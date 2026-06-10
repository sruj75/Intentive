#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeFactoryReport } from "../sensors/factory-report/index.mjs";
import { extractFindingsFromReport } from "./extract-findings.mjs";
import { readLedger, updateLedgerFromFindings, writeLedger } from "./ledger.mjs";
import { parseReportMarkdown } from "./parse-report.mjs";

const usage = `Intentive factory ledger

Refreshes factory memory from the current change set or a saved factory report.
Human statuses such as accepted, backlogged, and factory-improved are preserved.

Usage:
  pnpm factory:ledger
  node tools/factory/ledger-cli.mjs [--repo <path>] [--base <ref>] [--report <path>] [--ledger <path>]

Options:
  --repo <path>     Repository root. Defaults to the current directory.
  --base <ref>      Git ref to compare against when generating a live report.
  --report <path>   Use a saved factory report markdown file instead of live analysis.
  --ledger <path>   Ledger file path. Defaults to docs/factory/LEDGER.md.
  --dry-run         Print the updated ledger without writing it.
  --help            Show this help.
`;

if (isMainModule(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage);
      process.exit(0);
    }

    const findings = loadFindings(options);
    const ledgerPath = path.resolve(options.repo, options.ledger);
    const ledger = readLedgerSafe(ledgerPath);
    const updated = updateLedgerFromFindings(ledger, findings);

    if (options.dryRun) {
      console.log(formatSummary(updated, findings.length));
      process.exit(0);
    }

    mkdirSync(path.dirname(ledgerPath), { recursive: true });
    writeLedger(ledgerPath, updated);
    console.log(formatSummary(updated, findings.length));
    console.log(`Wrote ${path.relative(options.repo, ledgerPath)}`);
  } catch (error) {
    console.error(`factory:ledger: ${error.message}`);
    process.exit(1);
  }
}

function parseArgs(args) {
  const options = {
    repo: process.cwd(),
    base: "HEAD",
    report: null,
    ledger: "docs/factory/LEDGER.md",
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--repo") {
      options.repo = requireValue(args, index, arg);
      index += 1;
    } else if (arg === "--base") {
      options.base = requireValue(args, index, arg);
      index += 1;
    } else if (arg === "--report") {
      options.report = requireValue(args, index, arg);
      index += 1;
    } else if (arg === "--ledger") {
      options.ledger = requireValue(args, index, arg);
      index += 1;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return options;
}

function requireValue(args, index, arg) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
  return value;
}

function loadFindings(options) {
  if (options.report) {
    const reportPath = path.resolve(options.repo, options.report);
    const content = readFileSync(reportPath, "utf8");
    return parseReportMarkdown(content);
  }

  const report = analyzeFactoryReport({ repo: options.repo, base: options.base });
  return extractFindingsFromReport(report);
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

function formatSummary(ledger, findingCount) {
  const entries = Object.values(ledger.entries);
  const active = entries.filter((entry) => entry.status !== "fixed").length;
  return `Updated ledger from ${findingCount} finding(s). ${active} active entr${active === 1 ? "y" : "ies"}.`;
}

function isMainModule(metaUrl) {
  return process.argv[1] && fileURLToPath(metaUrl) === path.resolve(process.argv[1]);
}

export { loadFindings, parseArgs, readLedgerSafe };
