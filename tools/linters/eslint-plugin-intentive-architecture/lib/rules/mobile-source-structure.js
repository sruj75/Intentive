"use strict";

const path = require("node:path");
const { LAYER_ORDER } = require("../layer-rules");

const ALLOWED_ROOTS = new Set(["domains", "providers", "entrypoints", "design"]);
const ALLOWED_DOMAIN_LAYERS = new Set([...LAYER_ORDER, "providers"]);

function parseMobileSourcePath(filename) {
  if (typeof filename !== "string" || filename.length === 0 || filename === "<input>") return null;
  const segments = path.resolve(filename).replace(/\\/g, "/").split("/");
  const appsIndex = segments.lastIndexOf("apps");
  if (
    appsIndex === -1 ||
    segments[appsIndex + 1] !== "mobile" ||
    segments[appsIndex + 2] !== "src"
  ) {
    return null;
  }
  return segments.slice(appsIndex + 3);
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce the Mobile Client's allowed source roots and domain layers.",
    },
    schema: [],
    messages: {
      unknownRoot:
        "Rule violated: mobile-source-structure. Unknown Mobile src root '{{root}}'. " +
        "Owning boundary: apps/mobile/ARCHITECTURE.md. " +
        "Preferred path: src/domains, src/providers, src/entrypoints, src/design, or src/index.ts. " +
        "Example fix: move the module into its owning domain layer instead of adding a catch-all root.",
      unknownLayer:
        "Rule violated: mobile-source-structure. Unknown layer '{{layer}}' in Mobile domain '{{domain}}'. " +
        "Owning boundary: apps/mobile/ARCHITECTURE.md. " +
        "Preferred path: types, config, repo, service, runtime, ui, or domain-local providers. " +
        "Example fix: assign the module to the layer that owns its responsibility.",
    },
  },
  create(context) {
    return {
      Program(node) {
        const parts = parseMobileSourcePath(context.filename || context.getFilename());
        if (parts === null || parts.length === 0) return;
        if (parts.length === 1 && parts[0] === "index.ts") return;
        const root = parts[0];
        if (!ALLOWED_ROOTS.has(root)) {
          context.report({ node, messageId: "unknownRoot", data: { root: root || "<missing>" } });
          return;
        }
        if (root !== "domains") return;
        const domain = parts[1] || "<missing>";
        const layer = parts[2] || "<missing>";
        if (!ALLOWED_DOMAIN_LAYERS.has(layer)) {
          context.report({ node, messageId: "unknownLayer", data: { domain, layer } });
        }
      },
    };
  },
};

module.exports.parseMobileSourcePath = parseMobileSourcePath;
