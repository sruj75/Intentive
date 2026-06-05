"use strict";

const fs = require("fs");
const path = require("path");

const contextFiles = [
  { owner: "System-wide", relPath: "CONTEXT-MAP.md" },
  { owner: "Shared", relPath: "packages/CONTEXT.md" },
  { owner: "Mobile Client", relPath: "apps/mobile/CONTEXT.md" },
  { owner: "Desktop Client", relPath: "apps/desktop/CONTEXT.md" },
  { owner: "Control Plane", relPath: "services/control-plane/CONTEXT.md" },
  { owner: "Agent Runtime", relPath: "services/agent-runtime/CONTEXT.md" },
];

let cachedRepoRoot = null;
let cachedTerms = null;

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Flag forbidden CONTEXT.md vocabulary and point to the context that owns the canonical term.",
      recommended: true,
    },
    messages: {
      forbiddenTerm:
        'Vocabulary drift: "{{forbidden}}" belongs to {{owner}} vocabulary. Use "{{canonical}}". Owner: {{contextPath}}.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.physicalFilename || context.filename;
    if (!filename || shouldSkip(filename)) return {};

    const repoRoot = findRepoRoot(filename);
    const terms = loadTerms(repoRoot).filter((term) => appliesToFile(term, filename, repoRoot));
    if (terms.length === 0) return {};

    return {
      Program(node) {
        const candidates = collectVocabularyText(context.sourceCode, node);
        for (const term of terms) {
          for (const candidate of candidates) {
            const match = term.pattern.exec(candidate.text);
            if (!match) continue;

            context.report({
              node: candidate.node ?? node,
              loc: candidate.loc,
              messageId: "forbiddenTerm",
              data: {
                forbidden: match[0],
                canonical: term.canonical,
                owner: term.owner,
                contextPath: term.relPath,
              },
            });
            break;
          }
        }
      },
    };
  },
};

function loadTerms(repoRoot) {
  if (cachedRepoRoot === repoRoot && cachedTerms) return cachedTerms;

  const terms = [];
  for (const contextFile of contextFiles) {
    const absPath = path.join(repoRoot, contextFile.relPath);
    if (!fs.existsSync(absPath)) continue;

    let canonical = null;
    for (const rawLine of fs.readFileSync(absPath, "utf8").split(/\r?\n/)) {
      const termMatch = rawLine.match(/^\*\*([^*]+)\*\*:/);
      if (termMatch) {
        canonical = termMatch[1].trim();
        continue;
      }

      const avoidMatch = rawLine.match(/^_Avoid_:\s*(.+)$/);
      if (!avoidMatch || !canonical) continue;

      for (const forbidden of avoidMatch[1].split(",").map((term) => term.trim())) {
        if (!forbidden) continue;
        terms.push({
          forbidden,
          canonical,
          owner: contextFile.owner,
          relPath: contextFile.relPath,
          pattern: new RegExp(boundaryEscape(forbidden), "i"),
        });
      }
    }
  }

  cachedRepoRoot = repoRoot;
  cachedTerms = terms;
  return terms;
}

function findRepoRoot(filename) {
  let current = path.dirname(path.resolve(filename));
  while (current && current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "CONTEXT-MAP.md"))) return current;
    current = path.dirname(current);
  }
  return process.cwd();
}

function boundaryEscape(term) {
  const escaped = escapeRegExp(term);
  const startsWord = /^\w/.test(term);
  const endsWord = /\w$/.test(term);
  const suffix = term.toLowerCase() === "the agent" ? "(?!\\s+Runtime)" : "";
  return `${startsWord ? "(?<![\\w-])" : ""}${escaped}${endsWord ? "(?![\\w-])" : ""}${suffix}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shouldSkip(filename) {
  const normalized = filename.replace(/\\/g, "/");
  return (
    normalized.includes("/node_modules/") ||
    normalized.includes("/dist/") ||
    normalized.includes("/build/") ||
    normalized.includes("/coverage/") ||
    normalized.includes("/target/") ||
    normalized.includes("/reference/")
  );
}

function collectVocabularyText(sourceCode, programNode) {
  const candidates = sourceCode.getAllComments().map((comment) => ({
    text: stripUrls(comment.value),
    loc: comment.loc.start,
    node: comment,
  }));

  visit(programNode, (node) => {
    if (node.type === "JSXText") {
      candidates.push({ text: stripUrls(node.value), loc: node.loc.start, node });
    }
  });

  return candidates;
}

function stripUrls(value) {
  return value.replace(/https?:\/\/\S+/g, "");
}

function visit(node, fn) {
  if (!node || typeof node !== "object") return;
  fn(node);

  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue;
    if (Array.isArray(value)) {
      for (const child of value) visit(child, fn);
    } else if (value && typeof value === "object" && typeof value.type === "string") {
      visit(value, fn);
    }
  }
}

function appliesToFile(term, filename, repoRoot) {
  if (term.owner === "System-wide" || term.owner === "Shared") return true;

  const relPath = path.relative(repoRoot, path.resolve(filename)).replace(/\\/g, "/");
  if (term.owner === "Mobile Client") return relPath.startsWith("apps/mobile/");
  if (term.owner === "Desktop Client") return relPath.startsWith("apps/desktop/");
  if (term.owner === "Control Plane") return relPath.startsWith("services/control-plane/");
  if (term.owner === "Agent Runtime") return relPath.startsWith("services/agent-runtime/");

  return false;
}
