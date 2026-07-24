#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function inspectDependencyExceptions(repo = process.cwd(), now = new Date()) {
  const errors = [];
  const workspace = readFileSync(path.join(repo, "pnpm-workspace.yaml"), "utf8");
  const policy = JSON.parse(
    readFileSync(path.join(repo, "docs/security/dependency-audit-exceptions.json"), "utf8"),
  );
  const ignored = new Set(
    [...workspace.matchAll(/^\s*-\s*(GHSA-[a-z0-9-]+)\s*$/gm)].map((match) => match[1]),
  );
  const declared = new Set();

  for (const exception of policy.exceptions ?? []) {
    if (!/^GHSA-[a-z0-9-]+$/.test(exception.ghsa ?? "")) {
      errors.push("dependency exception has an invalid GHSA");
      continue;
    }
    if (declared.has(exception.ghsa))
      errors.push(`duplicate dependency exception: ${exception.ghsa}`);
    declared.add(exception.ghsa);
    for (const field of ["reachability", "owner"]) {
      if (typeof exception[field] !== "string" || exception[field].trim() === "") {
        errors.push(`${exception.ghsa} is missing ${field}`);
      }
    }
    const expiryMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(exception.expires ?? "");
    const expiry = new Date(`${exception.expires}T23:59:59Z`);
    const isRealCalendarDate =
      expiryMatch &&
      !Number.isNaN(expiry.valueOf()) &&
      expiry.getUTCFullYear() === Number(expiryMatch[1]) &&
      expiry.getUTCMonth() + 1 === Number(expiryMatch[2]) &&
      expiry.getUTCDate() === Number(expiryMatch[3]);
    if (!isRealCalendarDate) {
      errors.push(`${exception.ghsa} has an invalid expiry`);
    } else if (expiry < now) {
      errors.push(`${exception.ghsa} expired on ${exception.expires}`);
    }
  }

  for (const ghsa of ignored) {
    if (!declared.has(ghsa)) errors.push(`pnpm audit ignore lacks a policy entry: ${ghsa}`);
  }
  for (const ghsa of declared) {
    if (!ignored.has(ghsa)) errors.push(`dependency exception is not configured in pnpm: ${ghsa}`);
  }
  return errors;
}

function isMainModule(metaUrl) {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(metaUrl);
}

if (isMainModule(import.meta.url)) {
  const errors = inspectDependencyExceptions();
  if (errors.length > 0) {
    for (const error of errors) console.error(`dependency-exceptions: ${error}`);
    process.exit(1);
  }
  console.log("dependency-exceptions: passed");
}
