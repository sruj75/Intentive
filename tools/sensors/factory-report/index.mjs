#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeHarnessHealth } from "../harness-health/index.mjs";
import { analyzeImpactRadius } from "../impact-radius/index.mjs";
import { extractFindingsFromReport } from "../../factory/extract-findings.mjs";
import {
  actionLabel,
  buildFactoryContext,
  recommendedClassification,
  workspaceForPath,
} from "../../factory/focus.mjs";
import { ledgerStatusForFinding, readLedger } from "../../factory/ledger.mjs";

const maxListItems = 20;

const usage = `Intentive factory report

Aggregates advisory factory signals into one PR handoff report. The report is
not a quality score and does not fail on findings.

Usage:
  pnpm sensor:factory-report
  node tools/sensors/factory-report/index.mjs [--format markdown] [--base <ref>] [--repo <path>] [--output <path>] [--ledger <path>] [--audit]

Options:
  --format markdown  Output format. Only markdown is supported.
  --base <ref>       Git ref to compare against. Defaults to HEAD.
  --repo <path>      Repository root to analyze. Defaults to the current directory.
  --output <path>    Write the markdown report to this path as well as stdout.
  --ledger <path>    Ledger file used to mark findings as new or repeated.
  --audit            Include full repo-wide sensor details.
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
    const output = formatMarkdownReport(report, {
      ledgerEntries: ledger.entries,
      audit: options.audit,
    });
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
  const impactRadius = analyzeImpactRadius({ repo, base });
  const harnessHealth = analyzeHarnessHealth({ repo, base });

  return {
    base,
    impactRadius,
    harnessHealth,
    behaviorProof: analyzeBehaviorProof({ repo, impactRadius }),
  };
}

export function formatMarkdownReport(report, { ledgerEntries = {}, audit = false } = {}) {
  const findings = extractFindingsFromReport(report);
  const findingsByCategory = groupFindings(findings);
  const factoryContext = buildFactoryContext({
    findings,
    ledgerEntries,
    changedFiles: report.impactRadius.changedFiles,
    affectedWorkspaces: report.impactRadius.affectedWorkspaces,
  });
  const lines = [];

  lines.push("<!-- intentive:factory-report -->");
  lines.push("## Factory Radar");
  lines.push("");
  lines.push(`Base: \`${report.base}\``);
  lines.push("");
  lines.push(
    "Radar is advisory PR review triage. It highlights change-tied and learning findings; it is not a quality score or merge gate.",
  );
  lines.push("");
  lines.push(
    "Run the self-improvement loop with `docs/factory/SELF-IMPROVEMENT.md` after copying this comment into a Conductor agent.",
  );
  lines.push("");

  radarSection(lines, factoryContext, report.behaviorProof, report.impactRadius);

  if (audit) {
    lines.push("### Audit Details");
    lines.push("");
    lines.push(
      "Full repo-wide sensor output follows because `--audit` was passed. Use this for scheduled or explicit maintenance, not normal PR review.",
    );
    lines.push("");
    learningMetricsSection(lines, factoryContext.metrics);
    impactRadiusSection(lines, report.impactRadius, findingsByCategory);
    harnessHealthSection(lines, report.harnessHealth, findingsByCategory, ledgerEntries);
    findingsSummarySection(lines, findings, ledgerEntries);
    classificationSection(lines, findings, ledgerEntries, factoryContext);
  }

  return lines.join("\n");
}

function radarSection(lines, context, behaviorProof, impactRadius) {
  const actionable = context.items.filter((item) => {
    if (item.finding.category === "dependency") return false;
    return (
      item.isChangedFile ||
      item.isChangedWorkspace ||
      item.isRepeatedUnclassified ||
      item.isReturned
    );
  });
  const dependencyGroups = context.dependencyGroups.filter((group) => {
    return group.isPrTied || group.isRepeatedUnclassified || group.isReturned;
  });

  lines.push("### Radar");
  lines.push("");
  lines.push(
    "Start here. These findings are tied to the change, repeated without classification, or returned after being marked fixed.",
  );
  lines.push("");

  section(lines, "Actionable Findings", actionable, (item) => {
    return `- \`${item.finding.id}\` (${actionLabel(item)}): ${item.finding.title}; recommended classification: ${recommendedClassification(item)}`;
  });

  dependencyMaintenanceSection(lines, dependencyGroups);
  section(lines, "Changed Files", impactRadius.changedFiles, (file) => `- \`${file}\``);
  changedWorkspacesSection(lines, context.changedWorkspaces);
  behaviorProofSection(lines, behaviorProof);
  repoWideSummarySection(lines, context.metrics);
}

function learningMetricsSection(lines, metrics) {
  lines.push("### Radar Metrics");
  lines.push("");
  lines.push(
    "Use these counts to judge whether the factory is learning. They are advisory signals, not a CI gate.",
  );
  lines.push("");
  lines.push("| Metric | Count |");
  lines.push("| --- | ---: |");
  lines.push(`| PR-tied findings | ${metrics.prTiedFindings} |`);
  lines.push(`| Repo-wide findings | ${metrics.repoWideFindings} |`);
  lines.push(`| New findings | ${metrics.newFindings} |`);
  lines.push(`| Repeated unclassified findings | ${metrics.repeatedUnclassifiedFindings} |`);
  lines.push(`| Returned findings | ${metrics.returnedFindings} |`);
  lines.push(`| Accepted findings | ${metrics.acceptedFindings} |`);
  lines.push(`| Backlogged findings | ${metrics.backloggedFindings} |`);
  lines.push(`| Factory-improved findings | ${metrics.factoryImprovedFindings} |`);
  lines.push("");
}

function dependencyMaintenanceSection(lines, groups) {
  lines.push("#### Dependency Maintenance");

  if (groups.length === 0) {
    lines.push("- no dependency maintenance finding needs PR-time action");
  } else {
    for (const group of groups.slice(0, maxListItems)) {
      const scope = group.isPrTied ? "changed workspace" : "repo-wide";
      lines.push(
        `- \`dependency-maintenance:${group.workspace}\`: ${group.items.length} outdated direct dependenc${group.items.length === 1 ? "y" : "ies"} (${scope}); recommended classification: Backlogged`,
      );
    }
    if (groups.length > maxListItems) {
      lines.push(`- ...and ${groups.length - maxListItems} more`);
    }
  }

  lines.push("");
}

function behaviorProofSection(lines, behaviorProof) {
  lines.push("#### Behavior Coverage");
  lines.push("");
  lines.push(
    "Changed workspaces should have product-behavior slices represented in the scoped harness templates.",
  );
  lines.push("");

  if (!behaviorProof.available) {
    lines.push(`- not available: ${behaviorProof.reason}`);
    lines.push("");
    return;
  }

  if (behaviorProof.slices.length === 0) {
    lines.push("- no changed workspace has a configured behavior-proof slice");
    lines.push("");
    return;
  }

  for (const slice of behaviorProof.slices) {
    const status = slice.present ? "present" : "missing";
    const commands = slice.commands.map(formatCommandObject).join("; ");
    lines.push(`- ${slice.workspace}: ${slice.label} (${status}) via ${commands}`);
  }
  lines.push("");
}

function changedWorkspacesSection(lines, changedWorkspaces) {
  lines.push("#### Changed Workspaces");

  if (changedWorkspaces.size === 0) {
    lines.push("- none");
  } else {
    for (const workspace of [...changedWorkspaces].sort()) {
      lines.push(`- \`${workspace}\``);
    }
  }

  lines.push("");
}

function repoWideSummarySection(lines, metrics) {
  lines.push("#### Repo-Wide Drift Summary");
  lines.push("");
  lines.push("| Signal | Count |");
  lines.push("| --- | ---: |");
  lines.push(`| PR-tied findings | ${metrics.prTiedFindings} |`);
  lines.push(`| Repo-wide findings hidden by default | ${metrics.repoWideFindings} |`);
  lines.push(`| New findings | ${metrics.newFindings} |`);
  lines.push(`| Repeated unclassified findings | ${metrics.repeatedUnclassifiedFindings} |`);
  lines.push(`| Returned findings | ${metrics.returnedFindings} |`);
  lines.push(`| Accepted findings | ${metrics.acceptedFindings} |`);
  lines.push(`| Backlogged findings | ${metrics.backloggedFindings} |`);
  lines.push(`| Factory-improved findings | ${metrics.factoryImprovedFindings} |`);
  lines.push("");
  lines.push("Run `pnpm sensor:factory-report --audit` for full repo-wide details.");
  lines.push("");
}

function parseArgs(args) {
  const options = {
    repo: process.cwd(),
    base: "HEAD",
    format: "markdown",
    output: null,
    ledger: "docs/factory/LEDGER.md",
    audit: false,
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
    } else if (arg === "--audit") {
      options.audit = true;
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

function classificationSection(lines, findings, ledgerEntries, factoryContext) {
  lines.push("### Improvement Handoff");
  lines.push("");
  lines.push(
    "For each material finding above, classify the response before merge. If the same finding keeps recurring, prefer `Factory improved` or `Backlogged` over leaving it unclassified.",
  );
  lines.push("");
  lines.push("| Finding ID | Finding | Classification | Durable action |");
  lines.push("| --- | --- | --- | --- |");

  const materialFindings = factoryContext.items.filter((item) => {
    if (!isMaterialFinding(item.finding.category)) return false;
    return item.finding.category !== "dependency";
  });

  const groupedRows = [
    ...factoryContext.dependencyGroups.map((group) => ({
      id: `dependencies in ${group.workspace}`,
      title: `${group.items.length} dependency freshness finding(s)`,
      classification: group.isPrTied ? "Backlogged / Fixed now" : "Backlogged",
      action: "Group as one dependency-maintenance item for the workspace.",
    })),
    ...materialFindings.map((item) => {
      const status = ledgerStatusForFinding(ledgerEntries[item.finding.id]);
      return {
        id: `\`${item.finding.id}\``,
        title: `${item.finding.title} (${status.label}, seen ${status.seenCount}x)`,
        classification: recommendedClassification(item),
        action: actionLabel(item),
      };
    }),
  ];

  if (groupedRows.length === 0) {
    lines.push(
      "| _none material_ | | Fixed now / Factory improved / Backlogged / Accepted | Guide, sensor, test, workflow, issue, or rationale |",
    );
  } else {
    for (const row of groupedRows.slice(0, maxListItems)) {
      lines.push(`| ${row.id} | ${row.title} | ${row.classification} | ${row.action} |`);
    }
    if (groupedRows.length > maxListItems) {
      lines.push(`| _truncated_ | ...and ${groupedRows.length - maxListItems} more | | |`);
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

function analyzeBehaviorProof({ repo, impactRadius }) {
  const repoRoot = path.resolve(repo);
  const manifestPath = path.join(repoRoot, "tools/harness/behavior-proof.json");
  if (!existsSync(manifestPath)) {
    return { available: false, reason: "tools/harness/behavior-proof.json is missing", slices: [] };
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const changedWorkspaces = new Set([
    ...impactRadius.changedFiles.map(workspaceForPath).filter(Boolean),
    ...impactRadius.affectedWorkspaces.map((entry) => entry.workspace),
  ]);

  const slices = [];
  for (const slice of manifest.slices ?? []) {
    if (!changedWorkspaces.has(slice.workspace)) continue;
    const template = readHarnessTemplate(repoRoot, slice.workspace);
    const templateCommands = template
      ? [...(template.sensors ?? []), ...(template.requiredCommands ?? [])]
      : [];
    const present =
      Boolean(template) &&
      slice.commands.every((command) => {
        return templateCommands.some((candidate) => commandsEqual(candidate, command));
      });

    slices.push({
      ...slice,
      present,
    });
  }

  return { available: true, slices };
}

function readHarnessTemplate(repoRoot, workspace) {
  const templateNames = ["mobile", "desktop", "control-plane", "agent-runtime"];
  for (const name of templateNames) {
    const filePath = path.join(repoRoot, "tools/harness", `${name}.json`);
    if (!existsSync(filePath)) continue;
    const template = JSON.parse(readFileSync(filePath, "utf8"));
    if (template.scope === workspace || template.aliases?.includes(workspace)) return template;
  }
  return null;
}

function commandsEqual(left, right) {
  return left.command === right.command && JSON.stringify(left.args) === JSON.stringify(right.args);
}

function formatCommandObject(command) {
  return `\`${[command.command, ...command.args].join(" ")}\``;
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
