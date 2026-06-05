"use strict";

const { parseRustDomainPath } = require("./rust-path-parser");
const { extractDomainReferences } = require("./rust-imports");
// Single source of truth for the layer order — shared with the ESLint plugin
// so TS and Rust can never drift on what "forward" means.
const { canImport } = require("../../eslint-plugin-intentive-architecture/lib/layer-rules");

const MESSAGES = {
  backwardImport: (d) =>
    `Rule violated: layer-direction (types → config → repo → service → runtime → ui). ` +
    `'${d.domain}/${d.fromLayer}' cannot reference higher layer 'crate::domains::${d.domain}::${d.toLayer}'. ` +
    `Owning boundary: Rust domain '${d.domain}' inside the Desktop Client binary; code may only reference same or lower layers. ` +
    `Preferred path: reference 'crate::domains::${d.domain}::${d.fromLayer}' or lower layers, or use a trait seam injected at lib.rs. ` +
    `Example fix: move reusable behavior from '${d.domain}/${d.toLayer}' into '${d.domain}/${d.fromLayer}' or a lower layer, then let higher layers depend downward.`,
  crossDomainImport: (d) =>
    `Rule violated: Rust domain boundary. '${d.fromDomain}/${d.fromLayer}' cannot reference another domain's internal 'crate::domains::${d.toDomain}::${d.toLayer}'. ` +
    `Owning boundary: Rust domains are vertical product capabilities inside the Desktop Client binary. ` +
    `Preferred path: reference only 'crate::domains::${d.toDomain}::types' across domains, or compose behavior at lib.rs through an injected trait seam. ` +
    `Example fix: define a trait in '${d.fromDomain}/types' or '${d.fromDomain}/service' and wire the '${d.toDomain}/${d.toLayer}' implementation at lib.rs instead of importing it directly.`,
};

/** A colocated Rust unit-test module (`tests.rs` or anything under `tests/`). */
function isTestFile(filePath) {
  const norm = filePath.replace(/\\/g, "/");
  return /\/tests\.rs$/.test(norm) || /\/tests\//.test(norm);
}

/**
 * Check one Rust source file for layer-direction and cross-domain violations.
 *
 * Files that don't resolve to a layered domain (lib.rs, main.rs, the
 * cross-cutting `providers/` tree, anything outside `domains/`) are the
 * composition root / shared infrastructure and return no violations.
 *
 * Cross-domain policy (the single Rust binary has no `packages/` layer, so
 * this is the binary-local adaptation of the TS rule):
 *   - importing another domain's `types` layer is allowed — pure data
 *     contracts, the in-binary analog of `packages/domain-types/`;
 *   - importing any other layer of another domain is forbidden — that
 *     behavior/state coupling must go through a trait seam wired at lib.rs;
 *   - `crate::providers::…` (cross-cutting) is always allowed and is simply
 *     never reported (the extractor only looks at `crate::domains::…`);
 *   - colocated test modules compose collaborators like mini composition
 *     roots, so they are exempt from the cross-domain rule.
 *
 * @param {{filePath:string, source:string}} input
 * @returns {Array<{messageId:string, message:string, line:number}>}
 */
function checkSource({ filePath, source }) {
  const self = parseRustDomainPath(filePath);
  if (!self) return [];
  if (self.layer === "providers") return []; // cross-cutting; not part of the order

  const testFile = isTestFile(filePath);
  const violations = [];
  for (const ref of extractDomainReferences(source)) {
    if (ref.domain !== self.domain) {
      if (testFile) continue; // tests may compose across domains
      if (ref.layer === "types") continue; // shared data contracts are allowed
      const data = {
        fromDomain: self.domain,
        fromLayer: self.layer,
        toDomain: ref.domain,
        toLayer: ref.layer,
      };
      violations.push({
        messageId: "crossDomainImport",
        message: MESSAGES.crossDomainImport(data),
        line: ref.line,
      });
      continue;
    }
    if (!canImport(self.layer, ref.layer)) {
      const data = {
        fromLayer: self.layer,
        toLayer: ref.layer,
        domain: self.domain,
      };
      violations.push({
        messageId: "backwardImport",
        message: MESSAGES.backwardImport(data),
        line: ref.line,
      });
    }
  }
  return violations;
}

module.exports = { checkSource, MESSAGES };
