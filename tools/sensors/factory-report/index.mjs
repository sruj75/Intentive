#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeHarnessHealth } from "../harness-health/index.mjs";
import { analyzeImpactRadius } from "../impact-radius/index.mjs";

const maxListItems = 20;

const usage = `Intentive factory report

Aggregates advisory factory signals into one PR handoff report. The report is
not a quality score and does not fail on findings.

Usage:
  pnpm sensor:factory-report
  node tools/sensors/factory-report/index.mjs [--format markdown] [--base <ref>] [--repo <path>] [--output <path>]

Options:
  --format markdown  Output format. Only markdown is supported.
  --base <ref>       Git ref to compare against. Defaults to HEAD.
  --repo <path>      Repository root to analyze. Defaults to the current directory.
  --output <path>    Write the markdown report to this path as well as stdout.
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
    const output = formatMarkdownReport(report);
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

export function formatMarkdownReport(report) {
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

  impactRadiusSection(lines, report.impactRadius);
  harnessHealthSection(lines, report.harnessHealth);
  classificationSection(lines);

  return lines.join("\n");
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

function impactRadiusSection(lines, report) {
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
  section(lines, "Boundary-Crossing Internal Imports", report.boundaryImports, (entry) => {
    return `- \`${entry.from}\` (${entry.fromWorkspace}) -> \`${entry.to}\` (${entry.toWorkspace})`;
  });
  section(lines, "Touched Public Exports", report.publicExports, (entry) => {
    const exportsText =
      entry.exports.length > 0 ? entry.exports.map((name) => `\`${name}\``).join(", ") : "none";
    return `- \`${entry.file}\` (${entry.workspace}): ${exportsText}`;
  });
  section(lines, "Affected Workspaces", report.affectedWorkspaces, (entry) => {
    return `- \`${entry.workspace}\`: ${entry.reasons.join("; ")}`;
  });
}

function harnessHealthSection(lines, report) {
  lines.push("### Harness Health");
  lines.push("");
  lines.push(
    "Use this section to decide what should be fixed now, improved in the factory, backlogged, or accepted with rationale.",
  );
  lines.push("");
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
}

function classificationSection(lines) {
  lines.push("### Factory Steward Handoff");
  lines.push("");
  lines.push(
    "For each material finding above, classify the response before merge. If the same finding keeps recurring, prefer `Factory improved` or `Backlogged` over leaving it unclassified.",
  );
  lines.push("");
  lines.push("| Finding | Classification | Durable action |");
  lines.push("| --- | --- | --- |");
  lines.push(
    "| _fill in if material_ | Fixed now / Factory improved / Backlogged / Accepted | Guide, sensor, test, workflow, issue, or rationale |",
  );
  lines.push("");
  lines.push("Recommendation format for factory changes:");
  lines.push("");
  lines.push("- observed signal");
  lines.push("- likely factory gap");
  lines.push("- proposed guide, sensor, test, or workflow change");
  lines.push("- cost and risk");
  lines.push("- automatic, agent-suggested, or human-approved");
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

function dependencySection(lines, freshness) {
  lines.push("#### Dependency Freshness");

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

function isMainModule(metaUrl) {
  return process.argv[1] && fileURLToPath(metaUrl) === path.resolve(process.argv[1]);
}
