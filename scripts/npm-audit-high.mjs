#!/usr/bin/env node
/**
 * CI npm audit gate aligned with Neon Auth docs:
 * https://neon.com/docs/auth/overview — Neon ships a managed better-auth pin
 * (currently 1.4.18). Do not override better-auth to 1.6.x via npm overrides;
 * that breaks @neondatabase/auth-ui production builds (missing apiKeyClient).
 */
import { execSync } from "node:child_process";

const NEON_MANAGED_BETTER_AUTH_ADVISORIES = new Set([
  "GHSA-p6v2-xcpg-h6xw",
  "GHSA-wxw3-q3m9-c3jr",
]);

function readAuditReport() {
  try {
    return execSync("npm audit --audit-level=high --json", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    return error.stdout ?? error.output?.[1]?.toString() ?? "";
  }
}

function collectGhsaIds(entry) {
  const ids = [];
  for (const item of entry.via ?? []) {
    if (typeof item === "object" && item.url) {
      ids.push(item.url.split("/").pop());
    }
  }
  return ids;
}

function isNeonManagedTree(entry) {
  const nodes = entry.nodes ?? [];
  return (
    nodes.length > 0 &&
    nodes.every((nodePath) => nodePath.includes("node_modules/@neondatabase/"))
  );
}

function isAllowlistedHigh(entry) {
  const ghsaIds = collectGhsaIds(entry);
  if (ghsaIds.length > 0) {
    return ghsaIds.every((id) => NEON_MANAGED_BETTER_AUTH_ADVISORIES.has(id));
  }
  return isNeonManagedTree(entry);
}

const report = JSON.parse(readAuditReport());
const blocking = Object.entries(report.vulnerabilities ?? {}).filter(
  ([, entry]) =>
    (entry.severity === "high" || entry.severity === "critical") &&
    !isAllowlistedHigh(entry),
);

if (blocking.length > 0) {
  console.error(
    "npm audit reported high/critical issues outside Neon-managed better-auth:",
  );
  for (const [name, entry] of blocking) {
    console.error(`- ${name} (${entry.severity})`);
  }
  process.exit(1);
}

console.log(
  "npm audit high: only Neon-managed better-auth advisories remain (per Neon Auth docs).",
);
