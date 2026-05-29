"use strict";

// Under `src-tauri/src/` the only things allowed are the composition-root
// entry points, the `domains/` tree, and the cross-cutting `providers/` tree
// (the binary-local analog of `packages/providers/`). Everything else must
// live inside a domain layer. This keeps the file system itself honest about
// the architecture instead of relying on convention.
const ALLOWED_SRC_ENTRIES = new Set(["lib.rs", "main.rs", "domains", "providers"]);

/**
 * Given the top-level entry names of an `apps/<name>/src-tauri/src/`
 * directory, return the names that violate the structural rule.
 *
 * @param {string[]} entryNames
 * @returns {string[]}  offending entry names (empty when compliant)
 */
function structuralViolations(entryNames) {
  if (!Array.isArray(entryNames)) return [];
  return entryNames.filter((name) => !ALLOWED_SRC_ENTRIES.has(name));
}

module.exports = { ALLOWED_SRC_ENTRIES, structuralViolations };
