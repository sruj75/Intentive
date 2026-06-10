import { ledgerStatusForFinding } from "./ledger.mjs";

const workspaceRoots = ["apps", "services", "packages"];
const repoWideMaintenanceCategories = new Set(["dependency", "dependency-maintenance"]);
const reviewAttentionCategories = new Set(["high-fan-in", "oversized-file"]);

export function buildFactoryContext({
  findings,
  ledgerEntries = {},
  changedFiles = [],
  affectedWorkspaces = [],
} = {}) {
  const changedFileSet = new Set(changedFiles);
  const changedWorkspaceSet = new Set([
    ...affectedWorkspaces.map((entry) => (typeof entry === "string" ? entry : entry.workspace)),
    ...changedFiles.map(workspaceForPath).filter(Boolean),
  ]);

  const items = findings.map((finding) =>
    enrichFinding(finding, {
      changedFileSet,
      changedWorkspaceSet,
      ledgerEntries,
    }),
  );

  return {
    changedFiles: changedFileSet,
    changedWorkspaces: changedWorkspaceSet,
    items: items.sort(compareFactoryItems),
    metrics: buildLearningMetrics(items),
    dependencyGroups: groupDependencies(items),
    reviewAttention: items.filter((item) => {
      return reviewAttentionCategories.has(item.finding.category) && !item.isPrTied;
    }),
  };
}

export function workspaceForPath(filePath) {
  if (!filePath) return null;
  const normalized = filePath.split(":")[0];
  const parts = normalized.split("/");
  if (parts.length < 2 || !workspaceRoots.includes(parts[0])) return null;
  return `${parts[0]}/${parts[1]}`;
}

export function compareFactoryItems(left, right) {
  return left.rank - right.rank || left.finding.id.localeCompare(right.finding.id);
}

export function recommendedClassification(item) {
  if (item.isChangedFile) return "Fixed now / Factory improved";
  if (item.isChangedWorkspace) return "Review attention";
  if (item.isRepeatedUnclassified || item.isReturned) return "Backlogged / Factory improved";
  if (repoWideMaintenanceCategories.has(item.finding.category)) return "Backlogged";
  return "Accepted / Backlogged";
}

export function actionLabel(item) {
  if (item.isChangedFile) return "decide before merge";
  if (item.isChangedWorkspace) return "review with this workspace";
  if (item.isRepeatedUnclassified) return "classify repeated drift";
  if (item.isReturned) return "classify returned drift";
  if (repoWideMaintenanceCategories.has(item.finding.category)) return "group as maintenance";
  return "audit only";
}

function enrichFinding(finding, { changedFileSet, changedWorkspaceSet, ledgerEntries }) {
  const status = ledgerStatusForFinding(ledgerEntries[finding.id]);
  const ledgerEntry = ledgerEntries[finding.id];
  const file = findingFile(finding);
  const workspace = findingWorkspace(finding, file);
  const isChangedFile = Boolean(file && changedFileSet.has(file));
  const isChangedWorkspace = Boolean(workspace && changedWorkspaceSet.has(workspace));
  const isRepeatedUnclassified = status.label === "repeated";
  const isReturned = status.label === "returned";
  const isRepoWideMaintenance = repoWideMaintenanceCategories.has(finding.category);
  const isPrTied = isChangedFile || isChangedWorkspace;

  return {
    finding,
    ledgerEntry,
    status,
    file,
    workspace,
    isChangedFile,
    isChangedWorkspace,
    isRepeatedUnclassified,
    isReturned,
    isRepoWideMaintenance,
    isPrTied,
    rank: focusRank({
      isChangedFile,
      isChangedWorkspace,
      isRepeatedUnclassified,
      isReturned,
      isRepoWideMaintenance,
    }),
  };
}

function findingFile(finding) {
  if (!finding.location) return null;
  if (finding.category === "dependency") return null;
  return finding.location.split(":")[0];
}

function findingWorkspace(finding, file) {
  if (finding.category === "dependency" || finding.category === "dependency-maintenance") {
    return finding.location;
  }
  return workspaceForPath(file);
}

function focusRank({
  isChangedFile,
  isChangedWorkspace,
  isRepeatedUnclassified,
  isReturned,
  isRepoWideMaintenance,
}) {
  if (isChangedFile) return 0;
  if (isChangedWorkspace) return 1;
  if (isRepeatedUnclassified) return 2;
  if (isReturned) return 3;
  if (isRepoWideMaintenance) return 4;
  return 5;
}

function buildLearningMetrics(items) {
  const metrics = {
    prTiedFindings: 0,
    repoWideFindings: 0,
    newFindings: 0,
    repeatedUnclassifiedFindings: 0,
    returnedFindings: 0,
    acceptedFindings: 0,
    backloggedFindings: 0,
    factoryImprovedFindings: 0,
  };

  for (const item of items) {
    if (item.isPrTied) metrics.prTiedFindings += 1;
    else metrics.repoWideFindings += 1;

    switch (item.status.label) {
      case "new":
        metrics.newFindings += 1;
        break;
      case "repeated":
        metrics.repeatedUnclassifiedFindings += 1;
        break;
      case "returned":
        metrics.returnedFindings += 1;
        break;
      default:
        if (item.status.label === "accepted") metrics.acceptedFindings += 1;
        if (item.status.label === "backlogged") metrics.backloggedFindings += 1;
        if (item.status.label === "factory-improved") metrics.factoryImprovedFindings += 1;
        break;
    }
  }

  return metrics;
}

function groupDependencies(items) {
  const groups = new Map();

  for (const item of items) {
    if (item.finding.category !== "dependency") continue;
    const workspace = item.workspace || item.finding.location || "unknown";
    const group = groups.get(workspace) ?? {
      workspace,
      items: [],
      isPrTied: false,
      isRepeatedUnclassified: false,
      isReturned: false,
    };

    group.items.push(item);
    group.isPrTied ||= item.isPrTied;
    group.isRepeatedUnclassified ||= item.isRepeatedUnclassified;
    group.isReturned ||= item.isReturned;
    groups.set(workspace, group);
  }

  return [...groups.values()].sort((left, right) => left.workspace.localeCompare(right.workspace));
}
