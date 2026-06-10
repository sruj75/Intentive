import { buildFactoryContext, recommendedClassification, workspaceForPath } from "./focus.mjs";

const approvalByCategory = {
  "stale-scaffold": "agent-suggested",
  "oversized-file": "human-approved",
  "high-fan-in": "human-approved",
  suppression: "human-approved",
  vocabulary: "agent-suggested",
  dependency: "agent-suggested",
  "untested-export": "agent-suggested",
  "boundary-import": "human-approved",
};

const actionByCategory = {
  "stale-scaffold":
    "Replace the scaffold with real behavior, or create a tracked issue if the scaffold is intentional placeholder work.",
  "oversized-file":
    "Split the file around named domain responsibilities, or backlog a focused refactor issue with the target boundaries.",
  "high-fan-in":
    "Increase review depth, add contract tests, or move shared knowledge into the owning package.",
  suppression:
    "Remove stale suppressions or document why the exception remains load-bearing in the owning guide or ADR.",
  vocabulary:
    "Update product language in source, update the owning CONTEXT doc if the term changed, or allowlist a genuine technical term in the sensor with a fixture.",
  dependency:
    "Upgrade the dependency, defer with rationale in the ledger, or open a dependency-maintenance backlog item.",
  "untested-export":
    "Add focused tests for the export, reduce the export surface, or record why the export is intentionally untested.",
  "boundary-import":
    "Move shared knowledge into packages/, add an ADR for the exception, or refactor the import to respect deployable boundaries.",
};

export function buildRecommendations({ findings, ledgerEntries = {}, changedFiles = [] }) {
  const context = buildFactoryContext({ findings, ledgerEntries, changedFiles });
  const recommendations = [];
  const groupedFindingIds = new Set();
  const dependencyMaintenanceItems = context.items.filter((item) => {
    return item.finding.category === "dependency-maintenance";
  });

  if (dependencyMaintenanceItems.length > 0) {
    for (const item of dependencyMaintenanceItems) {
      groupedFindingIds.add(item.finding.id);
      recommendations.push(dependencyMaintenanceRecommendation(item));
    }
    for (const item of context.items) {
      if (item.finding.category === "dependency") groupedFindingIds.add(item.finding.id);
    }
  } else {
    for (const group of context.dependencyGroups) {
      for (const item of group.items) groupedFindingIds.add(item.finding.id);
      recommendations.push(dependencyGroupRecommendation(group));
    }
  }

  const reviewAttention = context.reviewAttention.filter((item) => {
    return item.finding.category === "high-fan-in" || item.finding.category === "oversized-file";
  });

  if (reviewAttention.length > 0) {
    for (const item of reviewAttention) groupedFindingIds.add(item.finding.id);
    recommendations.push(reviewAttentionRecommendation(reviewAttention));
  }

  for (const item of context.items) {
    if (groupedFindingIds.has(item.finding.id)) continue;
    recommendations.push(individualRecommendation(item));
  }

  return recommendations;
}

function individualRecommendation(item) {
  const finding = item.finding;
  const ledgerEntry = item.ledgerEntry;
  const status = item.status;
  const seenCount = ledgerEntry?.seenCount ?? status.seenCount ?? 1;
  const escalation =
    seenCount >= 3 && (!ledgerEntry || ["new", "watching"].includes(ledgerEntry.status))
      ? "Escalate: seen 3+ times without classification. Add a backlog item or improve the factory."
      : seenCount >= 2 && (!ledgerEntry || ["new", "watching"].includes(ledgerEntry.status))
        ? "Recommend classification before merge."
        : null;

  return {
    id: finding.id,
    title: finding.title,
    detail: finding.detail,
    findings: [finding],
    status,
    seenCount,
    escalation,
    recommendation: {
      observedSignal: observedSignal(item),
      whyItMatters: whyItMatters(finding.category),
      whatHappenedBefore: historyText(ledgerEntry, status, seenCount),
      recommendedClassification: recommendedClassification(item),
      recommendedAction:
        actionByCategory[finding.category] ?? "Review the finding and classify it.",
      risk: riskText(finding.category),
      approvalNeeded: approvalByCategory[finding.category] ?? "human-approved",
      filesLikelyAffected: likelyFiles(finding),
    },
  };
}

function dependencyGroupRecommendation(group) {
  const changedText = group.isPrTied ? "changed workspace" : "repo-wide maintenance";
  const statusText = group.isRepeatedUnclassified
    ? "includes repeated unclassified findings"
    : group.isReturned
      ? "includes returned findings"
      : "new or classified freshness drift";

  return {
    id: `dependency-maintenance:${group.workspace}`,
    title: `Dependency maintenance in ${group.workspace}`,
    detail: `${group.items.length} outdated direct dependenc${group.items.length === 1 ? "y" : "ies"} (${changedText}; ${statusText})`,
    findings: group.items.map((item) => item.finding),
    status: { label: "grouped", seenCount: group.items.length },
    seenCount: group.items.length,
    escalation: group.isRepeatedUnclassified
      ? "Escalate: dependency freshness is repeating without classification. Backlog a maintenance lane or approve an upgrade slice."
      : null,
    recommendation: {
      observedSignal: `${group.items.length} dependency freshness finding(s) for ${group.workspace}.`,
      whyItMatters: whyItMatters("dependency"),
      whatHappenedBefore: summarizeGroupHistory(group.items),
      recommendedClassification: group.isPrTied ? "Backlogged / Fixed now" : "Backlogged",
      recommendedAction:
        "Create or update one dependency-maintenance backlog item for this workspace instead of reviewing each package as a separate PR task.",
      risk: riskText("dependency"),
      approvalNeeded: approvalByCategory.dependency,
      filesLikelyAffected: [packageJsonPath(group.workspace), "docs/factory/BACKLOG.md"],
    },
  };
}

function dependencyMaintenanceRecommendation(item) {
  const count = dependencyCountFromDetail(item.finding.detail);
  const workspace = item.workspace || item.finding.location;
  const changedText = item.isPrTied ? "changed workspace" : "repo-wide maintenance";

  return {
    id: item.finding.id,
    title: `Dependency maintenance in ${workspace}`,
    detail: `${count} outdated direct dependenc${count === 1 ? "y" : "ies"} (${changedText})`,
    findings: [item.finding],
    status: item.status,
    seenCount: count,
    escalation: item.isRepeatedUnclassified
      ? "Escalate: dependency freshness is repeating without classification. Backlog a maintenance lane or approve an upgrade slice."
      : null,
    recommendation: {
      observedSignal: `${count} dependency freshness finding(s) for ${workspace}.`,
      whyItMatters: whyItMatters("dependency"),
      whatHappenedBefore: historyText(item.ledgerEntry, item.status, item.status.seenCount ?? 1),
      recommendedClassification: item.isPrTied ? "Backlogged / Fixed now" : "Backlogged",
      recommendedAction:
        "Create or update one dependency-maintenance backlog item for this workspace instead of reviewing each package as a separate PR task.",
      risk: riskText("dependency"),
      approvalNeeded: approvalByCategory.dependency,
      filesLikelyAffected: [packageJsonPath(workspace), "docs/factory/BACKLOG.md"],
    },
  };
}

function reviewAttentionRecommendation(items) {
  const byCategory = new Map();
  for (const item of items) {
    byCategory.set(item.finding.category, (byCategory.get(item.finding.category) ?? 0) + 1);
  }
  const counts = [...byCategory.entries()]
    .map(([category, count]) => `${count} ${category}`)
    .join(", ");

  return {
    id: "review-attention:repo-wide-structure",
    title: "Repo-wide structure review attention",
    detail: `${items.length} high fan-in or oversized-file finding(s): ${counts}`,
    findings: items.map((item) => item.finding),
    status: { label: "grouped", seenCount: items.length },
    seenCount: items.length,
    escalation: null,
    recommendation: {
      observedSignal:
        "The report found structural drift outside the changed files, so it should steer review attention rather than force a refactor in this PR.",
      whyItMatters:
        "Large or widely imported modules can increase future change cost, but unrelated repo-wide drift should not drown out this PR's material findings.",
      whatHappenedBefore: summarizeGroupHistory(items),
      recommendedClassification: "Accepted / Backlogged",
      recommendedAction:
        "Review only if the current PR touches the same area; otherwise accept with rationale or add a focused refactor backlog item.",
      risk: "Low if treated as review triage. Medium if it triggers unrelated refactors in the current PR.",
      approvalNeeded: "human-approved",
      filesLikelyAffected: ["docs/factory/BACKLOG.md"],
    },
  };
}

export function formatRecommendationsMarkdown(recommendations, { source = "factory report" } = {}) {
  const lines = [];
  lines.push("# Factory Recommendations");
  lines.push("");
  lines.push(`Source: ${source}`);
  lines.push("");
  lines.push(
    "Recommendation-only output. Do not edit tracked files until a human approves specific items.",
  );
  lines.push("");

  if (recommendations.length === 0) {
    lines.push("No material findings to recommend against.");
    lines.push("");
    return lines.join("\n");
  }

  for (const item of recommendations) {
    lines.push(`## ${item.id}`);
    lines.push("");
    lines.push("**Finding**");
    lines.push(`- ${item.title}`);
    lines.push(`- ${item.detail}`);
    if (item.findings.length > 1) {
      lines.push(`- Grouped findings: ${item.findings.length}`);
    }
    lines.push("");
    lines.push("**Observed signal**");
    lines.push(`- ${item.recommendation.observedSignal}`);
    lines.push("");
    lines.push("**Why it matters**");
    lines.push(`- ${item.recommendation.whyItMatters}`);
    lines.push("");
    lines.push("**What has happened before**");
    lines.push(`- ${item.recommendation.whatHappenedBefore}`);
    lines.push("");
    lines.push("**Recommended classification**");
    lines.push(`- ${item.recommendation.recommendedClassification}`);
    lines.push("");
    lines.push("**Recommended action**");
    lines.push(`- ${item.recommendation.recommendedAction}`);
    lines.push("");
    lines.push("**Risk**");
    lines.push(`- ${item.recommendation.risk}`);
    lines.push("");
    lines.push("**Approval needed**");
    lines.push(`- ${item.recommendation.approvalNeeded}`);
    lines.push("");
    lines.push("**Files likely affected**");
    for (const file of item.recommendation.filesLikelyAffected) {
      lines.push(`- \`${file}\``);
    }
    lines.push("");

    if (item.escalation) {
      lines.push("**Escalation**");
      lines.push(`- ${item.escalation}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

function observedSignal(item) {
  if (item.isChangedFile) return "Finding is on a file changed by this PR.";
  if (item.isChangedWorkspace) {
    return `Finding is in changed workspace ${item.workspace}.`;
  }
  if (item.isRepeatedUnclassified) return "Finding has repeated without classification.";
  if (item.isReturned) return "Finding disappeared and returned.";
  return "Finding is repo-wide drift outside the current PR surface.";
}

function summarizeGroupHistory(items) {
  const counts = new Map();
  for (const item of items) {
    counts.set(item.status.label, (counts.get(item.status.label) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => `${count} ${label}`).join(", ");
}

function dependencyCountFromDetail(detail) {
  const match = detail.match(/(\d+) outdated direct dependenc/);
  return match ? Number.parseInt(match[1], 10) : 1;
}

function packageJsonPath(workspace) {
  return workspace.includes("/") ? `${workspace}/package.json` : "package.json";
}

function whyItMatters(category) {
  switch (category) {
    case "stale-scaffold":
      return "Scaffold files look like progress but hide missing product behavior.";
    case "oversized-file":
      return "Large files usually mean responsibilities are piling up faster than boundaries are forming.";
    case "high-fan-in":
      return "High fan-in modules amplify the blast radius of every change.";
    case "suppression":
      return "Suppressions mean the factory is tolerating an exception that future agents may copy.";
    case "vocabulary":
      return "Product language drift makes docs, UI, and agent guidance disagree with each other.";
    case "dependency":
      return "Stale dependencies increase security and maintenance risk over time.";
    case "untested-export":
      return "Public exports without tests can break dependents silently.";
    case "boundary-import":
      return "Cross-boundary imports make deployables harder to change independently.";
    default:
      return "Repeated factory drift usually means the harness needs a durable improvement.";
  }
}

function historyText(ledgerEntry, status, seenCount) {
  if (!ledgerEntry) {
    return "First time seen in the ledger.";
  }

  const parts = [
    `Status: ${ledgerEntry.status}.`,
    `Seen count: ${seenCount}.`,
    `First seen: ${ledgerEntry.firstSeen ?? "unknown"}.`,
    `Last seen: ${ledgerEntry.lastSeen ?? "unknown"}.`,
  ];

  if (ledgerEntry.rationale) {
    parts.push(`Rationale: ${ledgerEntry.rationale}`);
  }

  if (status.label === "returned") {
    parts.push("This finding disappeared and came back.");
  }

  return parts.join(" ");
}

function riskText(category) {
  switch (category) {
    case "vocabulary":
      return "Low if the change is a real product-language update. Medium if an allowlist hides real drift.";
    case "dependency":
      return "Medium. Upgrades can ripple through the monorepo.";
    case "oversized-file":
    case "high-fan-in":
    case "boundary-import":
      return "Medium to high. Structural changes need careful review.";
    default:
      return "Low to medium depending on whether the fix stays inside the current change.";
  }
}

function likelyFiles(finding) {
  const files = new Set();
  if (finding.location) {
    files.add(finding.location.split(":")[0]);
  }

  if (finding.category === "vocabulary") {
    files.add("CONTEXT-MAP.md");
    files.add("tools/sensors/harness-health/index.mjs");
  }

  if (finding.category === "boundary-import") {
    files.add("docs/ARCHITECTURE.md");
  }

  if (finding.category === "untested-export") {
    files.add(finding.location);
    const workspace = workspaceForPath(finding.location);
    if (workspace) files.add(`${workspace}/test`);
  }

  return [...files].filter(Boolean);
}
