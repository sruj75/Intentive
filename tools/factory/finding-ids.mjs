const slugPattern = /[^a-z0-9._-]+/gi;

export const LEDGER_STATUSES = [
  "new",
  "watching",
  "backlogged",
  "accepted",
  "factory-improved",
  "fixed",
];

export const HUMAN_CLASSIFICATIONS = ["fixed-now", "factory-improved", "backlogged", "accepted"];

export function normalizeSegment(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(slugPattern, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizePath(filePath) {
  return String(filePath ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "");
}

export function buildFindingId(category, parts) {
  const normalizedCategory = normalizeSegment(category);
  const normalizedParts = parts.map((part) => {
    if (typeof part === "string" && part.includes("/")) {
      return normalizePath(part);
    }
    return normalizeSegment(part);
  });

  return [normalizedCategory, ...normalizedParts.filter(Boolean)].join(":");
}

export function staleScaffoldId(file) {
  return buildFindingId("stale-scaffold", [file]);
}

export function oversizedFileId(file) {
  return buildFindingId("oversized-file", [file]);
}

export function highFanInId(file) {
  return buildFindingId("high-fan-in", [file]);
}

export function vocabularyId(file, forbidden, canonical) {
  return buildFindingId("vocabulary", [file, forbidden, canonical]);
}

export function untestedExportId(file, exportName) {
  return buildFindingId("untested-export", [file, exportName]);
}

export function dependencyId(workspace, packageName) {
  return `dependency:${normalizePath(workspace)}:${normalizeSegment(packageName)}`;
}

export function suppressionId(file, line, label) {
  return buildFindingId("suppression", [file, line, label]);
}

export function boundaryImportId(from, to) {
  return buildFindingId("boundary-import", [from, to]);
}
