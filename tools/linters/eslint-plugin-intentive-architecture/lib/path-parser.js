"use strict";

/**
 * Parse an absolute file path into the layered-domain segments the
 * architecture rules care about.
 *
 * Recognises any of:
 *   apps/<name>/src/domains/<domain>/<layer>/...
 *   apps/<name>/src-tauri/src/domains/<domain>/<layer>/...
 *   services/<name>/src/domains/<domain>/<layer>/...
 *
 * Returns `null` for any path that isn't inside a layered domain — utility
 * files, configs, tests under a top-level __tests__/, etc. The lint rules
 * use that null to mean "don't check this file."
 *
 * @param {string} absPath  absolute, normalised file path
 * @returns {{kind:'apps'|'services', deployable:string, domain:string, layer:string} | null}
 */
function parseDomainPath(absPath) {
  if (typeof absPath !== "string" || absPath.length === 0) return null;
  // Find ".../{apps|services}/<deployable>/.../domains/<domain>/<layer>/..."
  // A linear split scan, equivalent to the old regex but provably O(n):
  // locate the deployable root, then the first "domains" segment after it.
  const segments = absPath.replace(/\\/g, "/").split("/");
  const rootIdx = segments.findIndex((s) => s === "apps" || s === "services");
  if (rootIdx === -1 || rootIdx + 1 >= segments.length) return null;
  const kind = segments[rootIdx];
  const deployable = segments[rootIdx + 1];
  // first "domains" strictly after the deployable name
  const domainsIdx = segments.indexOf("domains", rootIdx + 2);
  if (domainsIdx === -1 || domainsIdx + 2 >= segments.length) return null;
  const domain = segments[domainsIdx + 1];
  const layer = segments[domainsIdx + 2];
  if (!deployable || !domain || !layer) return null;
  return { kind, deployable, domain, layer };
}

module.exports = { parseDomainPath };
