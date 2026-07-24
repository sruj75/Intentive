"use strict";

/**
 * Extract cross-module domain references from Rust source.
 *
 * The enforceable convention: cross-layer and cross-domain references inside
 * `src-tauri/src/domains/` use absolute crate paths of the form
 *
 *   crate::domains::<domain>::<layer>::...
 *
 * (`self::` / `super::` relative paths stay inside the current layer subtree
 * and are intentionally not policed — they cannot reach a different layer or
 * domain without going through an absolute `crate::domains::` path.)
 *
 * Returns one entry per reference found, de-duplicated, with the 1-based line
 * number of the first occurrence so the checker can point at it.
 *
 * @param {string} source  Rust file contents
 * @returns {Array<{domain:string, layer:string, line:number}>}
 */
function extractDomainReferences(source) {
  if (typeof source !== "string" || source.length === 0) return [];
  const refs = [];
  const seen = new Set();
  const re = /crate::domains::([A-Za-z_][A-Za-z0-9_]*)::([A-Za-z_][A-Za-z0-9_]*)/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    const domain = match[1];
    const layer = match[2];
    const key = `${domain}::${layer}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const line = source.slice(0, match.index).split("\n").length;
    refs.push({ domain, layer, line });
  }
  return refs;
}

module.exports = { extractDomainReferences };
