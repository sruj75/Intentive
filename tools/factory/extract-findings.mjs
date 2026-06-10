import {
  boundaryImportId,
  dependencyId,
  highFanInId,
  oversizedFileId,
  staleScaffoldId,
  suppressionId,
  untestedExportId,
  vocabularyId,
} from "./finding-ids.mjs";

export function extractFindingsFromReport(report) {
  const findings = [];

  for (const entry of report.harnessHealth.staleScaffolds) {
    findings.push({
      id: staleScaffoldId(entry.file),
      category: "stale-scaffold",
      title: `Stale scaffold in ${entry.file}`,
      detail: `${entry.kind}, ${entry.reason}`,
      location: entry.file,
      source: "harness-health",
    });
  }

  for (const entry of report.harnessHealth.oversizedFiles) {
    findings.push({
      id: oversizedFileId(entry.file),
      category: "oversized-file",
      title: `Oversized file ${entry.file}`,
      detail: `${entry.lines} lines (threshold ${entry.threshold})`,
      location: entry.file,
      source: "harness-health",
    });
  }

  for (const entry of report.harnessHealth.highFanIn) {
    findings.push({
      id: highFanInId(entry.file),
      category: "high-fan-in",
      title: `High fan-in module ${entry.file}`,
      detail: `fan-in ${entry.fanIn}`,
      location: entry.file,
      source: "harness-health",
    });
  }

  for (const entry of report.harnessHealth.suppressions) {
    findings.push({
      id: suppressionId(entry.file, entry.line, entry.label),
      category: "suppression",
      title: `Architecture suppression in ${entry.file}`,
      detail: `${entry.file}:${entry.line} ${entry.label}`,
      location: `${entry.file}:${entry.line}`,
      source: "harness-health",
    });
  }

  for (const entry of report.harnessHealth.forbiddenTerms) {
    findings.push({
      id: vocabularyId(entry.file, entry.forbidden, entry.canonical),
      category: "vocabulary",
      title: `Forbidden vocabulary in ${entry.file}`,
      detail: `"${entry.forbidden}" -> "${entry.canonical}" (${entry.owner})`,
      location: `${entry.file}:${entry.line}`,
      source: "harness-health",
    });
  }

  const freshness = report.harnessHealth.dependencyFreshness;
  if (freshness.available) {
    for (const entry of freshness.outdated) {
      findings.push({
        id: dependencyId(entry.workspace, entry.packageName),
        category: "dependency",
        title: `Outdated dependency ${entry.packageName}`,
        detail: `${entry.workspace}: ${entry.current} -> ${entry.latest}`,
        location: entry.workspace,
        source: "harness-health",
      });
    }
  }

  for (const entry of report.harnessHealth.untestedPublicExports) {
    findings.push({
      id: untestedExportId(entry.file, entry.exportName),
      category: "untested-export",
      title: `Untested export ${entry.exportName}`,
      detail: `${entry.exportName} from ${entry.file} (${entry.workspace})`,
      location: entry.file,
      source: "harness-health",
    });
  }

  for (const entry of report.impactRadius.boundaryImports) {
    findings.push({
      id: boundaryImportId(entry.from, entry.to),
      category: "boundary-import",
      title: `Boundary-crossing import`,
      detail: `${entry.from} (${entry.fromWorkspace}) -> ${entry.to} (${entry.toWorkspace})`,
      location: entry.from,
      source: "impact-radius",
    });
  }

  return findings.sort((left, right) => left.id.localeCompare(right.id));
}
