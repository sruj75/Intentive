"use strict";

/**
 * The canonical layer order, lowest to highest. A file at layer N may import
 * from layers 0..N (same layer is allowed). Imports at N+1 or above are
 * forbidden — that's the "depend forward" rule from docs/ARCHITECTURE.md.
 *
 *   types  →  config  →  repo  →  service  →  runtime  →  ui
 *
 * `providers/` is cross-cutting: every layer may import from it.
 */
const LAYER_ORDER = ["types", "config", "repo", "service", "runtime", "ui"];
const CROSS_CUTTING = new Set(["providers"]);

/**
 * Can a file in `fromLayer` import from a file in `toLayer`, assuming both
 * sit in the same domain inside the same deployable?
 *
 * Unknown layers (anything not in LAYER_ORDER or CROSS_CUTTING) get the
 * benefit of the doubt — the rule won't fire on them.
 *
 * @returns {boolean}
 */
function canImport(fromLayer, toLayer) {
  if (CROSS_CUTTING.has(toLayer)) return true;
  const fromIdx = LAYER_ORDER.indexOf(fromLayer);
  const toIdx = LAYER_ORDER.indexOf(toLayer);
  if (fromIdx === -1 || toIdx === -1) return true;
  return toIdx <= fromIdx;
}

module.exports = { LAYER_ORDER, CROSS_CUTTING, canImport };
