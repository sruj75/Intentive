import { ledgerStatusForFinding } from "./ledger.mjs";

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

export function buildRecommendations({ findings, ledgerEntries = {} }) {
  return findings.map((finding) => {
    const ledgerEntry = ledgerEntries[finding.id];
    const status = ledgerStatusForFinding(ledgerEntry);
    const seenCount = ledgerEntry?.seenCount ?? status.seenCount ?? 1;
    const escalation =
      seenCount >= 3 && (!ledgerEntry || ["new", "watching"].includes(ledgerEntry.status))
        ? "Escalate: seen 3+ times without classification. Add a backlog item or improve the factory."
        : seenCount >= 2 && (!ledgerEntry || ["new", "watching"].includes(ledgerEntry.status))
          ? "Recommend classification before merge."
          : null;

    return {
      finding,
      ledgerEntry,
      status,
      seenCount,
      escalation,
      recommendation: {
        whyItMatters: whyItMatters(finding.category),
        whatHappenedBefore: historyText(ledgerEntry, status, seenCount),
        recommendedAction:
          actionByCategory[finding.category] ?? "Review the finding and classify it.",
        risk: riskText(finding.category),
        approvalNeeded: approvalByCategory[finding.category] ?? "human-approved",
        filesLikelyAffected: likelyFiles(finding),
      },
    };
  });
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
    lines.push(`## ${item.finding.id}`);
    lines.push("");
    lines.push("**Finding**");
    lines.push(`- ${item.finding.title}`);
    lines.push(`- ${item.finding.detail}`);
    lines.push("");
    lines.push("**Why it matters**");
    lines.push(`- ${item.recommendation.whyItMatters}`);
    lines.push("");
    lines.push("**What has happened before**");
    lines.push(`- ${item.recommendation.whatHappenedBefore}`);
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
  }

  return [...files].filter(Boolean);
}
