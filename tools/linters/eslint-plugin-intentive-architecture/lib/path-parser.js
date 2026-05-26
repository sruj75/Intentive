'use strict';

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
  if (typeof absPath !== 'string' || absPath.length === 0) return null;
  const norm = absPath.replace(/\\/g, '/');
  // Find ".../{apps|services}/<deployable>/.../domains/<domain>/<layer>/..."
  // The middle ".../" allows for "src/", "src-tauri/src/", or any nesting.
  const m = norm.match(
    /\/(apps|services)\/([^/]+)\/(?:[^/]+\/)*?domains\/([^/]+)\/([^/]+)(?:\/|$)/
  );
  if (!m) return null;
  const [, kind, deployable, domain, layer] = m;
  return { kind, deployable, domain, layer };
}

module.exports = { parseDomainPath };
