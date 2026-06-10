#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { analyzeFactoryReport, formatMarkdownReport } from "../sensors/factory-report/index.mjs";
import { formatLedgerMarkdown, parseLedgerMarkdown, updateLedgerFromFindings } from "./ledger.mjs";
import { extractFindingsFromReport } from "./extract-findings.mjs";
import { parseReportMarkdown } from "./parse-report.mjs";
import { buildRecommendations, formatRecommendationsMarkdown } from "./recommend.mjs";

const ledgerCliPath = new URL("./ledger-cli.mjs", import.meta.url).pathname;
const recommendCliPath = new URL("./recommend-cli.mjs", import.meta.url).pathname;
const repo = mkdtempSync(path.join(tmpdir(), "intentive-factory-ledger-"));

try {
  mkdirSync(path.join(repo, "docs/factory"), { recursive: true });

  const report = analyzeFactoryReport({
    repo: process.cwd(),
    base: "HEAD",
  });
  const findings = extractFindingsFromReport(report);
  assert.ok(findings.length >= 0);

  const emptyLedger = { entries: {}, updatedAt: null };
  const updated = updateLedgerFromFindings(emptyLedger, findings.slice(0, 2));
  assert.equal(Object.keys(updated.entries).length, Math.min(findings.length, 2));

  if (findings.length >= 1) {
    const firstId = findings[0].id;
    const accepted = {
      ...updated,
      entries: {
        ...updated.entries,
        [firstId]: {
          ...updated.entries[firstId],
          status: "accepted",
          rationale: "intentional for now",
        },
      },
    };

    const seenAgain = updateLedgerFromFindings(accepted, findings.slice(0, 2));
    assert.equal(seenAgain.entries[firstId].status, "accepted");
    assert.equal(seenAgain.entries[firstId].rationale, "intentional for now");
    assert.ok(seenAgain.entries[firstId].seenCount >= 2);
  }

  const markdown = formatLedgerMarkdown(updated);
  const parsed = parseLedgerMarkdown(markdown);
  assert.equal(Object.keys(parsed.entries).length, Object.keys(updated.entries).length);

  const reportMarkdown = formatMarkdownReport(report, { ledgerEntries: updated.entries });
  const parsedFindings = parseReportMarkdown(reportMarkdown);
  assert.ok(parsedFindings.length >= Math.min(findings.length, 2));

  const recommendations = buildRecommendations({
    findings: parsedFindings.slice(0, 1),
    ledgerEntries: updated.entries,
  });
  const recommendationMarkdown = formatRecommendationsMarkdown(recommendations);
  assert.match(recommendationMarkdown, /Recommendation-only output/);
  assert.match(recommendationMarkdown, /Approval needed/);

  const sampleReportPath = path.join(repo, "sample-report.md");
  writeFileSync(sampleReportPath, reportMarkdown);

  execFileSync(process.execPath, [ledgerCliPath, "--repo", repo, "--report", sampleReportPath], {
    encoding: "utf8",
  });
  const ledgerContent = readFileSync(path.join(repo, "docs/factory/LEDGER.md"), "utf8");
  assert.match(ledgerContent, /<!-- intentive:factory-ledger:start -->/);

  execFileSync(
    process.execPath,
    [
      recommendCliPath,
      "--repo",
      repo,
      "--report",
      sampleReportPath,
      "--output",
      ".context/factory-recommendations.md",
    ],
    { encoding: "utf8" },
  );
  const recommendationOutput = readFileSync(
    path.join(repo, ".context/factory-recommendations.md"),
    "utf8",
  );
  assert.match(recommendationOutput, /Factory Recommendations/);

  console.log("factory ledger/recommend: fixture test passed");
} finally {
  rmSync(repo, { recursive: true, force: true });
}
