#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeHarnessHealth } from "../harness-health/index.mjs";
import { analyzeImpactRadius } from "../impact-radius/index.mjs";
import { extractFindingsFromReport } from "../../factory/extract-findings.mjs";
import { defaultLedgerPath, ledgerStatusForFinding, readLedger } from "../../factory/ledger.mjs";

const maxListItems = 20;

const usage = `Intentive factory report

Aggregates advisory factory signals into one PR handoff report. The report is
not a quality score and does not fail on findings.

Usage:
  pnpm sensor:factory-report
  node tools/sensors/factory-report/index.mjs [--format markdown] [--base <ref>] [--repo <path>] [--output <path>] [--ledger <path>]

Options:
  --format markdown  Output format. Only markdown is supported.
  --base <ref>       Git ref to compare against. Defaults to HEAD.
  --repo <path>      Repository root to analyze. Defaults to the current directory.
  --output <path>    Write the markdown report to this path as well as stdout.
  --ledger <path>    Ledger file used to mark findings as new or repeated.
  --help             Show this help.
`;

if (isMainModule(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage);
      process.exit(0);
    }

    const report = analyzeFactoryReport(options);
    const ledger = readLedgerSafe(path.resolve(options.repo, options.ledger));
    const output = formatMarkdownReport(report, { ledgerEntries: ledger.entries });
    if (options.output) {
      const outPath = path.resolve(options.repo, options.output);
      mkdirSync(path.dirname(outPath), { recursive: true });
      writeFileSync(outPath, output);
    }
    console.log(output);
  } catch (error) {
    console.error(`factory-report: ${error.message}`);
    process.exit(1);
  }
}

export function analyzeFactoryReport({ repo = process.cwd(), base = "HEAD" } = {}) {
  return {
    base,
    impactRadius: analyzeImpactRadius({ repo, base }),
    harnessHealth: analyzeHarnessHealth({ repo, base }),
  };
}

export function formatMarkdownReport(report, { ledgerEntries = {} } = {}) {
  const findings = extractFindingsFromReport(report);
  const findingsByCategory = groupFindings(findings);
  const lines = [];

  lines.push("<!-- intentive:factory-report -->");
  lines.push("## Factory Report");
  lines.push("");
  lines.push(`Base: \`${report.base}\``);
  lines.push("");
  lines.push(
    "This advisory report aggregates review-triage signals. Use it to classify material findings before merge; it is not a quality score.",
  );
  lines.push("");
  lines.push(
    "Run the self-improvement loop with `docs/factory/SELF-IMPROVEMENT.md` after copying this comment into a Conductor agent.",
  );
  lines.push("");

  impactRadiusSection(lines, report.impactRadius, findingsByCategory);
  harnessHealthSection(lines, report.harnessHealth, findingsByCategory, ledgerEntries);
  findingsSummarySection(lines, findings, ledgerEntries);
  classificationSection(lines, findings, ledgerEntries);

  return lines.join("\n");
}

function parseArgs(args) {
  const options = {
    repo: process.cwd(),
    base: "HEAD",
    format: "markdown",
    output: null,
    ledger: defaultLedgerPath(),
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
    } else if (arg === "--ledger") {
      options.ledger = requireValue(args, index, arg);
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

function impactRadiusSection(lines, report, findingsByCategory) {
  lines.push("### Impact Radius");
  lines.push("");
  lines.push(
    "Use this section to decide who should review and which workspaces need focused checks.",
  );
  lines.push("");
  section(lines, "Changed Files", report.changedFiles, (file) => `- \`${file}\``);
  section(lines, "Fan-In / Fan-Out", report.fan, (entry) => {
    return `- \`${entry.file}\`: fan-in ${entry.fanIn}, fan-out ${entry.fanOut}`;
  });
  section(lines, "Boundary-Crossing Internal Imports", report.boundaryImports, (entry) =>
    formatFindingLine(findingsByCategory, "boundary-import", entry, (item) => {
      return `${entry.from} (${entry.fromWorkspace}) -> ${entry.to} (${entry.toWorkspace})`;
    }),
  );
  section(lines, "Touched Public Exports", report.publicExports, (entry) => {
    const exportsText =
      entry.exports.length > 0 ? entry.exports.map((name) => `\`${name}\``).join(", ") : "none";
    return `- \`${entry.file}\` (${entry.workspace}): ${exportsText}`;
  });
  section(lines, "Affected Workspaces", report.affectedWorkspaces, (entry) => {
    return `- \`${entry.workspace}\`: ${entry.reasons.join("; ")}`;
  });
}

function harnessHealthSection(lines, report, findingsByCategory, ledgerEntries) {
  lines.push("### Harness Health");
  lines.push("");
  lines.push(
    "Use this section to decide what should be fixed now, improved in the factory, backlogged, or accepted with rationale.",
  );
  lines.push("");
  section(lines, "Stale Scaffold Tests And Sources", report.staleScaffolds, (entry) =>
    formatFindingLine(
      findingsByCategory,
      "stale-scaffold",
      entry,
      () => {
        return `\`${entry.file}\` (${entry.kind}, ${entry.reason})`;
      },
      ledgerEntries,
    ),
  );
  section(lines, "Files Over Threshold", report.oversizedFiles, (entry) =>
    formatFindingLine(
      findingsByCategory,
      "oversized-file",
      entry,
      () => {
        return `\`${entry.file}\`: ${entry.lines} lines (threshold ${entry.threshold})`;
      },
      ledgerEntries,
    ),
  );
  section(lines, "Highest Fan-In Modules", report.highFanIn, (entry) =>
    formatFindingLine(
      findingsByCategory,
      "high-fan-in",
      entry,
      () => {
        return `\`${entry.file}\`: fan-in ${entry.fanIn}`;
      },
      ledgerEntries,
    ),
  );
  section(lines, "Architecture Suppressions", report.suppressions, (entry) =>
    formatFindingLine(
      findingsByCategory,
      "suppression",
      entry,
      () => {
        return `\`${entry.file}:${entry.line}\`: ${entry.label}`;
      },
      ledgerEntries,
    ),
  );
  section(lines, "Forbidden Vocabulary Hits", report.forbiddenTerms, (entry) =>
    formatFindingLine(
      findingsByCategory,
      "vocabulary",
      entry,
      () => {
        return `\`${entry.file}:${entry.line}\`: "${entry.forbidden}" -> "${entry.canonical}" (${entry.owner})`;
      },
      ledgerEntries,
    ),
  );
  dependencySection(lines, report.dependencyFreshness, findingsByCategory, ledgerEntries);
  section(lines, "Untested Public Exports", report.untestedPublicExports, (entry) =>
    formatFindingLine(
      findingsByCategory,
      "untested-export",
      entry,
      () => {
        return `\`${entry.exportName}\` from \`${entry.file}\` (${entry.workspace})`;
      },
      ledgerEntries,
    ),
  );
}

function findingsSummarySection(lines, findings, ledgerEntries) {
  lines.push("### Finding Memory");
  lines.push("");

  if (findings.length === 0) {
    lines.push("- none");
    lines.push("");
    return;
  }

  const buckets = {
    new: [],
    repeated: [],
    classified: [],
    returned: [],
  };

  for (const finding of findings) {
    const status = ledgerStatusForFinding(ledgerEntries[finding.id]);
    if (status.label === "new") buckets.new.push(finding);
    else if (status.label === "repeated") buckets.repeated.push(finding);
    else if (status.label === "returned") buckets.returned.push(finding);
    else buckets.classified.push(finding);
  }

  printBucket(lines, "New findings", buckets.new);
  printBucket(lines, "Repeated unclassified findings", buckets.repeated);
  printBucket(lines, "Returned findings", buckets.returned);
  printBucket(lines, "Already classified findings", buckets.classified);
}

function printBucket(lines, title, findings) {
  lines.push(`#### ${title}`);
  if (findings.length === 0) {
    lines.push("- none");
  } else {
    for (const finding of findings.slice(0, maxListItems)) {
      lines.push(`- \`${finding.id}\`: ${finding.title}`);
    }
    if (findings.length > maxListItems) {
      lines.push(`- ...and ${findings.length - maxListItems} more`);
    }
  }
  lines.push("");
}

function classificationSection(lines, findings, ledgerEntries) {
  lines.push("### Factory Steward Handoff");
  lines.push("");
  lines.push(
    "For each material finding above, classify the response before merge. If the same finding keeps recurring, prefer `Factory improved` or `Backlogged` over leaving it unclassified.",
  );
  lines.push("");
  lines.push("| Finding ID | Finding | Classification | Durable action |");
  lines.push("| --- | --- | --- | --- |");

  const materialFindings = findings.filter((finding) => isMaterialFinding(finding.category));

  if (materialFindings.length === 0) {
    lines.push(
      "| _none material_ | | Fixed now / Factory improved / Backlogged / Accepted | Guide, sensor, test, workflow, issue, or rationale |",
    );
  } else {
    for (const finding of materialFindings.slice(0, maxListItems)) {
      const status = ledgerStatusForFinding(ledgerEntries[finding.id]);
      lines.push(
        `| \`${finding.id}\` | ${finding.title} (${status.label}, seen ${status.seenCount}x) | | |`,
      );
    }
    if (materialFindings.length > maxListItems) {
      lines.push(`| _truncated_ | ...and ${materialFindings.length - maxListItems} more | | |`);
    }
  }

  lines.push("");
  lines.push("Recommendation format for factory changes:");
  lines.push("");
  lines.push("- observed signal");
  lines.push("- likely factory gap");
  lines.push("- proposed guide, sensor, test, or workflow change");
  lines.push("- cost and risk");
  lines.push("- automatic, agent-suggested, or human-approved");
  lines.push("");
  lines.push(
    "After merge review, run `pnpm factory:recommend --report <saved-report.md>` and follow `docs/factory/SELF-IMPROVEMENT.md`.",
  );
}

function section(lines, title, values, format) {
  lines.push(`#### ${title}`);

  if (values.length === 0) {
    lines.push("- none");
  } else {
    for (const value of values.slice(0, maxListItems)) lines.push(format(value));
    if (values.length > maxListItems) lines.push(`- ...and ${values.length - maxListItems} more`);
  }

  lines.push("");
}

function dependencySection(lines, freshness, findingsByCategory, ledgerEntries) {
  lines.push("#### Dependency Freshness");

  if (!freshness.available) {
    lines.push(`- not available: ${freshness.reason}`);
  } else if (freshness.outdated.length === 0) {
    lines.push("- no outdated direct dependencies reported");
  } else {
    for (const entry of freshness.outdated.slice(0, maxListItems)) {
      lines.push(
        formatFindingLine(
          findingsByCategory,
          "dependency",
          entry,
          () => {
            return `\`${entry.packageName}\` in ${entry.workspace}: ${entry.current} -> ${entry.latest}`;
          },
          ledgerEntries,
        ),
      );
    }
    if (freshness.outdated.length > maxListItems) {
      lines.push(`- ...and ${freshness.outdated.length - maxListItems} more`);
    }
  }

  lines.push("");
}

function groupFindings(findings) {
  return new Map(findings.map((finding) => [finding.id, finding]));
}

function formatFindingLine(findingsByCategory, category, entry, renderDetail, ledgerEntries = {}) {
  const finding = [...findingsByCategory.values()].find(
    (candidate) => candidate.category === category && detailMatches(candidate, entry, category),
  );

  if (!finding) {
    return `- ${renderDetail(entry)}`;
  }

  const status = ledgerStatusForFinding(ledgerEntries[finding.id]);
  return `- \`${finding.id}\` (${status.label}, seen ${status.seenCount}x): ${renderDetail(entry)}`;
}

function detailMatches(finding, entry, category) {
  switch (category) {
    case "stale-scaffold":
      return finding.location === entry.file;
    case "oversized-file":
    case "high-fan-in":
      return finding.location === entry.file;
    case "suppression":
      return finding.location === `${entry.file}:${entry.line}`;
    case "vocabulary":
      return finding.location === `${entry.file}:${entry.line}`;
    case "dependency":
      return finding.location === entry.workspace && finding.detail.includes(entry.packageName);
    case "untested-export":
      return finding.location === entry.file && finding.detail.includes(entry.exportName);
    case "boundary-import":
      return finding.detail.includes(entry.from) && finding.detail.includes(entry.to);
    default:
      return false;
  }
}

function isMaterialFinding(category) {
  return [
    "stale-scaffold",
    "oversized-file",
    "high-fan-in",
    "suppression",
    "vocabulary",
    "dependency",
    "untested-export",
    "boundary-import",
  ].includes(category);
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
