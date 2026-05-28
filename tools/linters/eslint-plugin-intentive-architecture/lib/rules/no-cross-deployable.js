"use strict";

const path = require("path");
const { parseDomainPath } = require("../path-parser");

/**
 * ESLint rule: forbid one deployable from importing another deployable's
 * source directly.
 *
 *   apps/mobile/**     cannot import from apps/desktop/** or services/**
 *   apps/desktop/**    cannot import from apps/mobile/** or services/**
 *   services/<a>/**    cannot import from apps/** or services/<b>/**
 *
 * The only allowed cross-deployable knowledge sharing is through
 * packages/* — those are workspace packages, imported by name, not by path.
 *
 * Path-relative imports that resolve into a different deployable trip the
 * rule. Workspace-name imports (`@intentive/protocol`, etc.) do not.
 */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid relative imports that cross deployable boundaries. Shared code must live in packages/.",
      recommended: true,
    },
    messages: {
      crossDeployable:
        "Cross-deployable import: '{{fromKind}}/{{fromDeployable}}' is reaching into '{{toKind}}/{{toDeployable}}'. " +
        "Shared code belongs in packages/ — import it by workspace name (e.g. @intentive/protocol), not by relative path.",
    },
    schema: [],
  },
  create(context) {
    const filename = context.physicalFilename || context.filename;
    if (!filename) return {};
    const source = parseDomainPath(filename);
    // Even files outside layered domains shouldn't reach across deployables,
    // so we also check using a looser regex for non-domain files.
    const sourceDeployable = source || coarseDeployable(filename);
    if (!sourceDeployable) return {};

    return {
      ImportDeclaration(node) {
        const spec = node.source && node.source.value;
        if (typeof spec !== "string" || !spec.startsWith(".")) return;
        const resolved = path.resolve(path.dirname(filename), spec);
        const target = parseDomainPath(resolved) || coarseDeployable(resolved);
        if (!target) return;
        if (
          target.kind !== sourceDeployable.kind ||
          target.deployable !== sourceDeployable.deployable
        ) {
          context.report({
            node,
            messageId: "crossDeployable",
            data: {
              fromKind: sourceDeployable.kind,
              fromDeployable: sourceDeployable.deployable,
              toKind: target.kind,
              toDeployable: target.deployable,
            },
          });
        }
      },
    };
  },
};

/**
 * Identify the deployable a path belongs to, even when it's not inside a
 * layered domain. Used so utility / config / test files still can't reach
 * across deployable boundaries.
 */
function coarseDeployable(absPath) {
  const norm = absPath.replace(/\\/g, "/");
  const m = norm.match(/\/(apps|services)\/([^/]+)(?:\/|$)/);
  if (!m) return null;
  return { kind: m[1], deployable: m[2] };
}
