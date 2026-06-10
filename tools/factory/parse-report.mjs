import { extractFindingsFromReport } from "./extract-findings.mjs";
import { buildFindingId } from "./finding-ids.mjs";

const findingIdPattern = /`([a-z0-9._-]+(?::[a-z0-9._/-]+)+)`/g;

export function parseReportMarkdown(content) {
  const findings = [];
  const seen = new Set();

  for (const match of content.matchAll(findingIdPattern)) {
    const id = match[1];
    if (seen.has(id)) continue;
    seen.add(id);

    const category = id.split(":")[0];
    findings.push({
      id,
      category,
      title: titleFromId(id),
      detail: detailFromReportLine(content, id),
      location: locationFromId(id),
      source: category === "boundary-import" ? "impact-radius" : "harness-health",
    });
  }

  return findings.sort((left, right) => left.id.localeCompare(right.id));
}

export function parseReportContext(content) {
  return {
    changedFiles: parseMarkdownListSection(content, "Changed Files")
      .map((line) => {
        const match = line.match(/`([^`]+)`/);
        return match?.[1];
      })
      .filter(Boolean),
  };
}

export function parseReportInput({ content, report }) {
  if (report) {
    return extractFindingsFromReport(report);
  }

  if (content) {
    return parseReportMarkdown(content);
  }

  throw new Error("report input requires markdown content or an analyzed report object");
}

function parseMarkdownListSection(content, title) {
  const pattern = new RegExp(`#### ${escapeRegExp(title)}\\n([\\s\\S]*?)(?:\\n#### |\\n### |$)`);
  const match = content.match(pattern);
  if (!match) return [];
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));
}

function titleFromId(id) {
  const [category, ...rest] = id.split(":");
  if (category === "vocabulary") {
    return `Forbidden vocabulary in ${rest[0] ?? "unknown file"}`;
  }
  if (category === "untested-export") {
    return `Untested export ${rest[1] ?? rest[0] ?? "unknown"}`;
  }
  if (category === "dependency") {
    return `Outdated dependency ${rest[1] ?? rest[0] ?? "unknown"}`;
  }
  if (category === "dependency-maintenance") {
    return `Dependency maintenance in ${rest[0] ?? "unknown workspace"}`;
  }
  if (category === "boundary-import") {
    return "Boundary-crossing import";
  }
  if (category === "suppression") {
    return `Architecture suppression in ${rest[0] ?? "unknown file"}`;
  }
  if (category === "stale-scaffold") {
    return `Stale scaffold in ${rest[0] ?? "unknown file"}`;
  }
  if (category === "oversized-file") {
    return `Oversized file ${rest[0] ?? "unknown file"}`;
  }
  if (category === "high-fan-in") {
    return `High fan-in module ${rest[0] ?? "unknown file"}`;
  }

  return buildFindingId(category, rest);
}

function locationFromId(id) {
  const parts = id.split(":");
  if (parts[0] === "dependency") {
    return parts[1] ?? "";
  }
  return parts[1] ?? id;
}

function detailFromReportLine(content, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const linePattern = new RegExp(`-\\s+\`${escaped}\`[^\n]*`, "m");
  const match = content.match(linePattern);
  if (!match) return "";
  return match[0].replace(/^-\s+/, "").trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
