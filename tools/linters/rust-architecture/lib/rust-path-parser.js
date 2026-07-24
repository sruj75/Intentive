"use strict";

/**
 * Parse an absolute Rust file path into the layered-domain segments the
 * architecture rules care about.
 *
 * Recognises any `.rs` file inside:
 *   apps/<name>/src-tauri/src/domains/<domain>/<layer>(.rs | /...)
 *
 * The <layer> may be a flat file (`service.rs`) or a directory
 * (`service/mod.rs`, `service/fsm.rs`). Returns `null` for any path that
 * isn't inside a layered domain — `lib.rs`, `main.rs`, build artifacts, and
 * anything outside `domains/`. The checker treats that null as "composition
 * root / not subject to the layer rule."
 *
 * @param {string} absPath  absolute, normalised file path
 * @returns {{deployable:string, domain:string, layer:string} | null}
 */
function parseRustDomainPath(absPath) {
  if (typeof absPath !== "string" || absPath.length === 0) return null;
  const norm = absPath.replace(/\\/g, "/");
  const m = norm.match(/\/apps\/([^/]+)\/src-tauri\/src\/domains\/([^/]+)\/([^/]+?)(?:\.rs|\/|$)/);
  if (!m) return null;
  const [, deployable, domain, layer] = m;
  return { deployable, domain, layer };
}

module.exports = { parseRustDomainPath };
