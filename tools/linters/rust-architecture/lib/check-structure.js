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

function structuralMessage(offender) {
  return (
    `Rule violated: Rust src-tauri structure. '${offender}' cannot live directly under src-tauri/src/. ` +
    `Owning boundary: Desktop Rust source root only allows lib.rs, main.rs, domains/, and providers/. ` +
    `Preferred path: place product code under domains/<domain>/<layer>/ or cross-cutting code under providers/. ` +
    `Example fix: move '${offender}' to domains/capture/service/${offender} or to the owning domain/layer that matches its responsibility.`
  );
}

module.exports = { ALLOWED_SRC_ENTRIES, structuralMessage, structuralViolations };
