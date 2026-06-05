"use strict";

const path = require("path");
const { expectedCaseFor, matchesCase, nameSegment } = require("../filename-case-util");

/**
 * ESLint rule: enforce the monorepo's per-deployable filename casing so agents
 * (and humans) never have to guess what a new file should be named.
 *
 *   apps/desktop/**​/*.tsx  → PascalCase  (React component norm)
 *   everything else         → kebab-case
 *
 * `index`/`main` entrypoints, `*.d.ts`, and `*.test.*`/`*.spec.*` are exempt.
 * See docs/CONVENTIONS.md → "Filenames".
 */
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Enforce filename casing: PascalCase for desktop React components, kebab-case elsewhere.",
      recommended: true,
    },
    messages: {
      filenameCase:
        "Rule violated: filename-case. '{{name}}' must be {{expected}}. " +
        "Owning convention: desktop React components (.tsx) are PascalCase; every other file is kebab-case. " +
        "Example fix: rename '{{name}}' to {{example}}.",
    },
    schema: [],
  },
  create(context) {
    const filename = context.physicalFilename || context.filename;
    if (!filename) return {};

    const expected = expectedCaseFor(filename);
    if (!expected) return {};

    const basename = path.basename(filename);
    const name = nameSegment(basename);
    if (matchesCase(name, expected)) return {};

    return {
      Program(node) {
        context.report({
          node,
          messageId: "filenameCase",
          data: {
            name: basename,
            expected,
            example: expected === "PascalCase" ? "MyComponent.tsx" : "my-module.ts",
          },
        });
      },
    };
  },
};
