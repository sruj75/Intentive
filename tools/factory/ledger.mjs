import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { LEDGER_STATUSES } from "./finding-ids.mjs";

const ledgerMarkerStart = "<!-- intentive:factory-ledger:start -->";
const ledgerMarkerEnd = "<!-- intentive:factory-ledger:end -->";

export function defaultLedgerPath(repo = process.cwd()) {
  return path.join(repo, "docs/factory/LEDGER.md");
}

export function readLedger(ledgerPath) {
  const content = readFileSync(ledgerPath, "utf8");
  return parseLedgerMarkdown(content);
}

export function writeLedger(ledgerPath, ledger) {
  writeFileSync(ledgerPath, formatLedgerMarkdown(ledger));
}

export function parseLedgerMarkdown(content) {
  const start = content.indexOf(ledgerMarkerStart);
  const end = content.indexOf(ledgerMarkerEnd);

  if (start === -1 || end === -1 || end <= start) {
    return { entries: {}, updatedAt: null, rawIntro: content };
  }

  const jsonText = content.slice(start + ledgerMarkerStart.length, end).trim();
  const parsed = JSON.parse(jsonText);

  if (!parsed.entries || typeof parsed.entries !== "object") {
    throw new Error("ledger JSON must contain an entries object");
  }

  return {
    entries: parsed.entries,
    updatedAt: parsed.updatedAt ?? null,
    rawIntro: content.slice(0, start).trim(),
  };
}

export function formatLedgerMarkdown(ledger) {
  const intro =
    ledger.rawIntro ??
    [
      "# Factory Ledger",
      "",
      "This file remembers recurring factory findings across pull requests.",
      "Machine data lives between the HTML markers below. Human fields (status, rationale, owner, action) belong in each JSON entry and are rendered in the table.",
      "",
    ].join("\n");

  const entries = Object.values(ledger.entries).sort((left, right) =>
    left.id.localeCompare(right.id),
  );

  const lines = [];
  lines.push(intro);
  lines.push("");
  lines.push(ledgerMarkerStart);
  lines.push(
    JSON.stringify(
      {
        updatedAt: ledger.updatedAt ?? new Date().toISOString(),
        entries: ledger.entries,
      },
      null,
      2,
    ),
  );
  lines.push(ledgerMarkerEnd);
  lines.push("");
  lines.push("## Entries");
  lines.push("");
  lines.push(
    "| ID | Title | Status | First seen | Last seen | Seen count | Owner | Rationale | Action |",
  );
  lines.push("| --- | --- | --- | --- | --- | ---: | --- | --- | --- |");

  if (entries.length === 0) {
    lines.push("| _none yet_ | | | | | | | | |");
  } else {
    for (const entry of entries) {
      lines.push(
        `| \`${entry.id}\` | ${escapeCell(entry.title)} | ${entry.status} | ${entry.firstSeen ?? ""} | ${entry.lastSeen ?? ""} | ${entry.seenCount ?? 0} | ${escapeCell(entry.owner ?? "")} | ${escapeCell(entry.rationale ?? "")} | ${escapeCell(entry.actionUrl ?? "")} |`,
      );
    }
  }

  lines.push("");
  lines.push("Allowed statuses: " + LEDGER_STATUSES.join(", "));
  lines.push("");
  return lines.join("\n");
}

export function updateLedgerFromFindings(ledger, findings, { now = new Date() } = {}) {
  const timestamp = now.toISOString().slice(0, 10);
  const nextEntries = { ...ledger.entries };
  const seenIds = new Set();

  for (const finding of findings) {
    seenIds.add(finding.id);
    const existing = nextEntries[finding.id];

    if (!existing) {
      nextEntries[finding.id] = {
        id: finding.id,
        category: finding.category,
        title: finding.title,
        status: "new",
        firstSeen: timestamp,
        lastSeen: timestamp,
        seenCount: 1,
        owner: "",
        rationale: "",
        actionUrl: "",
      };
      continue;
    }

    const humanLocked = ["backlogged", "accepted", "factory-improved"].includes(existing.status);
    nextEntries[finding.id] = {
      ...existing,
      category: finding.category,
      title: finding.title,
      lastSeen: timestamp,
      seenCount: (existing.seenCount ?? 0) + 1,
      status: humanLocked
        ? existing.status
        : existing.status === "fixed"
          ? "new"
          : existing.status === "new" && (existing.seenCount ?? 0) >= 1
            ? "watching"
            : existing.status,
    };
  }

  for (const [id, entry] of Object.entries(nextEntries)) {
    if (seenIds.has(id)) continue;
    if (["backlogged", "accepted", "factory-improved"].includes(entry.status)) continue;
    if (entry.status === "fixed") continue;

    nextEntries[id] = {
      ...entry,
      status: "fixed",
      lastSeen: entry.lastSeen ?? timestamp,
    };
  }

  return {
    ...ledger,
    entries: nextEntries,
    updatedAt: now.toISOString(),
  };
}

export function ledgerStatusForFinding(entry) {
  if (!entry) {
    return { label: "new", seenCount: 1, detail: "first time seen" };
  }

  if (entry.status === "fixed") {
    return { label: "returned", seenCount: entry.seenCount ?? 1, detail: "was fixed, seen again" };
  }

  if (entry.status === "new") {
    return { label: "new", seenCount: entry.seenCount ?? 1, detail: "not classified yet" };
  }

  if (entry.status === "watching") {
    return {
      label: "repeated",
      seenCount: entry.seenCount ?? 1,
      detail: "seen before, not classified yet",
    };
  }

  return {
    label: entry.status,
    seenCount: entry.seenCount ?? 1,
    detail: entry.rationale || entry.status,
  };
}

function escapeCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
}
