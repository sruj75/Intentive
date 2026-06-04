"use strict";

const path = require("path");
const { parseDomainPath } = require("../path-parser");
const { canImport } = require("../layer-rules");

/**
 * ESLint rule: enforce forward-only layer dependencies within a domain.
 *
 * Reports an import as a violation when:
 *   - both the importing file and the imported file sit inside the same
 *     layered domain (same deployable, same domain), AND
 *   - the imported layer is "higher" than the importing layer per the rule
 *     in lib/layer-rules.js.
 *
 * Imports that leave the domain (different domain, different deployable,
 * package import, node_modules) are handled by sibling rules or ignored
 * here. Same-layer imports are always allowed.
 */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce Intentive's forward-only layer rule (types → config → repo → service → runtime → ui) within a business domain.",
      recommended: true,
    },
    messages: {
      backwardImport:
        "Rule violated: layer-direction (types → config → repo → service → runtime → ui). " +
        "'{{domain}}/{{fromLayer}}' cannot import higher layer '{{domain}}/{{toLayer}}'. " +
        "Owning boundary: domain '{{domain}}' inside this deployable; code may only import same or lower layers. " +
        "Preferred import path: stay within '{{domain}}/{{fromLayer}}' or lower layers, or use a cross-cutting providers/ seam. " +
        "Example fix: move reusable orchestration from '{{domain}}/{{toLayer}}' into '{{domain}}/{{fromLayer}}' or a lower layer, then let higher layers import downward.",
      crossDomainImport:
        "Rule violated: domain boundary. '{{fromDomain}}/{{fromLayer}}' cannot import another domain's internal '{{toDomain}}/{{toLayer}}'. " +
        "Owning boundary: domains are vertical product capabilities inside one deployable. " +
        "Preferred import path: use this domain's own layers, another domain's public types/ contract, or move shared knowledge to packages/* and import it by workspace name. " +
        "Example fix: extract the shared shape to packages/domain-types and import '@intentive/domain-types', or expose pure data from '{{toDomain}}/types' instead of reaching into '{{toDomain}}/{{toLayer}}'.",
    },
    schema: [],
  },
  create(context) {
    const filename = context.physicalFilename || context.filename;
    if (!filename) return {};
    const source = parseDomainPath(filename);
    if (!source) return {};
    if (source.layer === "providers") return {}; // providers is cross-cutting; not part of the layer order

    function checkImport(node, specifier) {
      if (typeof specifier !== "string" || !specifier.startsWith(".")) return;
      const resolved = path.resolve(path.dirname(filename), specifier);
      const target = parseDomainPath(resolved);
      if (!target) return;
      if (target.deployable !== source.deployable) return; // handled by no-cross-deployable

      if (target.domain !== source.domain) {
        context.report({
          node,
          messageId: "crossDomainImport",
          data: {
            fromDomain: source.domain,
            fromLayer: source.layer,
            toDomain: target.domain,
            toLayer: target.layer,
          },
        });
        return;
      }

      if (!canImport(source.layer, target.layer)) {
        context.report({
          node,
          messageId: "backwardImport",
          data: {
            fromLayer: source.layer,
            toLayer: target.layer,
            domain: source.domain,
          },
        });
      }
    }

    return {
      ImportDeclaration(node) {
        checkImport(node, node.source && node.source.value);
      },
      // Cover dynamic imports and require() calls too.
      ImportExpression(node) {
        if (node.source && node.source.type === "Literal") {
          checkImport(node, node.source.value);
        }
      },
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require" &&
          node.arguments.length === 1 &&
          node.arguments[0].type === "Literal"
        ) {
          checkImport(node, node.arguments[0].value);
        }
      },
    };
  },
};
