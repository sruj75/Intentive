"use strict";

const path = require("path");

/**
 * Filename-casing convention for the monorepo, derived from the actual tree:
 *
 *   - Desktop React component files (`apps/desktop/**​/*.tsx`) → PascalCase
 *     (`Onboarding.tsx`, `IntentiveAuthProvider.tsx`) — React component norm.
 *   - Everything else (mobile, services, packages, and desktop non-`.tsx`)
 *     → kebab-case (`companion-chat.tsx`, `auth-failure.ts`, `parse.ts`).
 *
 * Single-word lowercase names (`auth.ts`, `parse.ts`) are valid kebab-case, so
 * package and service files satisfy the kebab rule without renaming.
 */

// Basenames (sans extension) that are conventional regardless of case.
const EXEMPT = new Set(["index", "main"]);

/**
 * Strip the trailing extension(s) and return the leading name segment.
 * `companion-chat.rn.test.tsx` → `companion-chat`; `parse.ts` → `parse`.
 */
function nameSegment(basename) {
  const dot = basename.indexOf(".");
  return dot === -1 ? basename : basename.slice(0, dot);
}

/** True for files the rule should not check (tests, type decls, entrypoints). */
function isExempt(basename) {
  if (/\.d\.ts$/.test(basename)) return true;
  if (/\.(test|spec)\./.test(basename)) return true;
  return EXEMPT.has(nameSegment(basename));
}

/**
 * Return the expected case for a file, or `null` if the file is exempt or
 * outside the convention's scope.
 *
 * @param {string} absPath  absolute or relative file path
 * @returns {'PascalCase'|'kebab-case'|null}
 */
function expectedCaseFor(absPath) {
  if (typeof absPath !== "string" || absPath.length === 0) return null;
  const norm = absPath.replace(/\\/g, "/");
  const basename = path.posix.basename(norm);
  if (isExempt(basename)) return null;

  const isDesktop = /\/apps\/desktop\//.test(norm);
  if (isDesktop && /\.tsx$/.test(basename)) return "PascalCase";
  return "kebab-case";
}

/** True if `name` (a bare name segment) matches the given case. */
function matchesCase(name, expected) {
  switch (expected) {
    case "PascalCase":
      return /^[A-Z][A-Za-z0-9]*$/.test(name);
    case "kebab-case":
      return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
    default:
      return true;
  }
}

module.exports = { EXEMPT, nameSegment, isExempt, expectedCaseFor, matchesCase };
