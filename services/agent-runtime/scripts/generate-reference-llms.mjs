#!/usr/bin/env node
/**
 * Pack OpenClaw + Hermes into *-llms.txt, inject SECTION markers, write ANCHORS.md.
 *
 * Usage:
 *   node scripts/generate-reference-llms.mjs
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REPOMIX_ARGS, SECTION_ALIASES, TOPICS } from "./reference-config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "reference");
const TOPICS_DIR = path.join(OUT, "topics");

const OPENCLAW_REPO = process.env.OPENCLAW_REPO ?? "/tmp/openclaw-ref";
const HERMES_REPO = process.env.HERMES_REPO ?? "/tmp/hermes-ref";

const SECTION_LINE_RE = /^===== SECTION:(.+?) =====$/;

/** @param {string} filePath */
export function pathToSlug(filePath) {
  return filePath
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** @param {string} filePath @param {string} pattern */
function matchPath(filePath, pattern) {
  if (pattern.includes("*")) {
    const re = new RegExp(
      "^" +
        pattern
          .replace(/[.*+?^${}()|[\]\\]/g, (c) => (c === "*" ? c : "\\" + c))
          .replace(/\*\*/g, ".*")
          .replace(/\*/g, "[^/]*") +
        "$",
    );
    return re.test(filePath);
  }
  return filePath === pattern || filePath.endsWith(pattern);
}

/**
 * @param {string} body
 * @param {string} topicId
 */
export function injectSectionMarkers(body, topicId) {
  const aliases = SECTION_ALIASES[topicId] ?? {};
  const lines = body.split("\n");
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fileMatch = line.match(/^File: (.+)$/);
    const prevIsSep = i > 0 && /^=+$/.test(lines[i - 1]);

    if (fileMatch && prevIsSep) {
      const filePath = fileMatch[1].trim();
      const slug = pathToSlug(filePath);
      out.push(`===== SECTION:${slug} =====`);
      for (const [alias, pattern] of Object.entries(aliases)) {
        if (matchPath(filePath, pattern)) {
          out.push(`===== SECTION:${alias} =====`);
        }
      }
    }
    out.push(line);
  }

  return out.join("\n");
}

/**
 * @param {string} packRelPath e.g. reference/openclaw/gateway-llms.txt
 * @param {string} content
 * @returns {Array<{ id: string; line: number; sourcePath: string | null }>}
 */
export function extractAnchors(packRelPath, content) {
  const lines = content.split("\n");
  /** @type {Array<{ id: string; line: number; sourcePath: string | null }>} */
  const anchors = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(SECTION_LINE_RE);
    if (!m) continue;

    let sourcePath = null;
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      const fm = lines[j].match(/^File: (.+)$/);
      if (fm) {
        sourcePath = fm[1].trim();
        break;
      }
    }

    anchors.push({ id: m[1], line: i + 1, sourcePath });
  }

  return anchors.map((a) => ({ ...a, pack: packRelPath }));
}

/**
 * @param {Map<string, { pack: string; line: number; sourcePath: string | null }>} anchorMap
 */
function writeAnchorsMd(anchorMap, packManifest) {
  const lines = [
    "# Reference section anchors (generated)",
    "",
    "Do not edit by hand. Regenerate with `node scripts/generate-reference-llms.mjs`.",
    "",
    'Topic cards cite `SECTION:` ids — find line numbers here or use `rg -n "SECTION:…"` on the pack file.',
    "",
    "## Packs",
    "",
    "| Repo | Topic | File | Size |",
    "|------|-------|------|------|",
  ];

  for (const m of packManifest) {
    lines.push(`| ${m.repo} | ${m.topic} | \`${m.file}\` | ${(m.bytes / 1024).toFixed(0)} KB |`);
  }

  const byPack = new Map();
  for (const [id, meta] of anchorMap) {
    if (!byPack.has(meta.pack)) byPack.set(meta.pack, []);
    byPack.get(meta.pack).push({ id, ...meta });
  }

  for (const [pack, entries] of [...byPack.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(
      "",
      `## \`${pack}\``,
      "",
      "| Section ID | Line | Source path |",
      "|------------|------|-------------|",
    );
    for (const e of entries.sort((a, b) => a.line - b.line)) {
      const src = e.sourcePath ? `\`${e.sourcePath}\`` : "—";
      lines.push(`| \`${e.id}\` | ${e.line} | ${src} |`);
    }
  }

  fs.writeFileSync(path.join(OUT, "ANCHORS.md"), lines.join("\n") + "\n");
}

/**
 * @param {Map<string, unknown>} anchorMap
 */
function validateTopicCardRefs(anchorMap) {
  if (!fs.existsSync(TOPICS_DIR)) {
    console.warn("⚠ reference/topics/ missing — skip SECTION validation");
    return;
  }

  const refRe = /SECTION:([a-zA-Z0-9._:-]+)/g;
  const missing = [];

  for (const file of fs.readdirSync(TOPICS_DIR).filter((f) => f.endsWith(".md"))) {
    const content = fs.readFileSync(path.join(TOPICS_DIR, file), "utf8");
    const seen = new Set();
    let m;
    while ((m = refRe.exec(content)) !== null) {
      const id = m[1];
      if (seen.has(id)) continue;
      seen.add(id);
      if (!anchorMap.has(id)) {
        missing.push({ file, id });
      }
    }
  }

  if (missing.length > 0) {
    console.error("\n✖ Topic cards reference unknown SECTION ids:\n");
    for (const { file, id } of missing) {
      console.error(`  - ${file}: SECTION:${id}`);
    }
    console.error(
      "\nFix topic cards or SECTION_ALIASES in scripts/reference-config.mjs, then regen.",
    );
    process.exit(1);
  }

  console.log("\n✓ All SECTION: refs in reference/topics/ resolve in packs");
}

function packHeader(topic, packRelPath) {
  return [
    `# Reference pack: ${topic.repo} / ${topic.id}`,
    `# Generated: ${new Date().toISOString()}`,
    `# Source: ${topic.source}`,
    `# Pack path: ${packRelPath}`,
    `# Repomix: compressed plain text, tests excluded`,
    `# Sections: rg -n "SECTION:" ${packRelPath}`,
    `#`,
    `# Build context: OpenClaw-like shell on LangChain DeepAgents (TypeScript).`,
    `# DeepAgents owns: planning, tool loop, vfs, subagents, long-term memory.`,
    `# This file covers: ${topic.note}`,
    `#`,
    "",
  ].join("\n");
}

function runRepomix(repoPath, include, outFile) {
  const args = [
    "repomix",
    repoPath,
    "--include",
    include.join(","),
    ...REPOMIX_ARGS,
    "-o",
    outFile,
  ];
  const r = spawnSync("npx", ["--yes", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    cwd: ROOT,
  });
  if (r.status !== 0) {
    throw new Error(`repomix failed for ${outFile}:\n${r.stderr || r.stdout}`);
  }
}

function ensureRepos() {
  for (const [name, p, url] of [
    ["OPENCLAW_REPO", OPENCLAW_REPO, "https://github.com/openclaw/openclaw"],
    ["HERMES_REPO", HERMES_REPO, "https://github.com/nousresearch/hermes-agent"],
  ]) {
    if (!fs.existsSync(p)) {
      console.error(`${name}=${p} missing. Clone:\n  git clone --depth 1 ${url}.git ${p}`);
      process.exit(1);
    }
  }
}

function main() {
  ensureRepos();
  const packManifest = [];
  /** @type {Map<string, { pack: string; line: number; sourcePath: string | null }>} */
  const anchorMap = new Map();

  for (const topic of TOPICS) {
    const repoPath = topic.repo === "openclaw" ? OPENCLAW_REPO : HERMES_REPO;
    const dir = path.join(OUT, topic.repo);
    fs.mkdirSync(dir, { recursive: true });
    const outFile = path.join(dir, `${topic.id}-llms.txt`);
    const packRel = path.relative(ROOT, outFile).replace(/\\/g, "/");

    console.log(`\n→ ${packRel}`);
    runRepomix(repoPath, topic.include, outFile);

    let body = fs.readFileSync(outFile, "utf8");
    body = injectSectionMarkers(body, topic.id);

    const full = packHeader(topic, packRel) + body;
    fs.writeFileSync(outFile, full);

    for (const a of extractAnchors(packRel, full)) {
      if (!anchorMap.has(a.id)) {
        anchorMap.set(a.id, {
          pack: a.pack,
          line: a.line,
          sourcePath: a.sourcePath,
        });
      }
    }

    const stat = fs.statSync(outFile);
    packManifest.push({
      repo: topic.repo,
      topic: topic.id,
      file: packRel,
      bytes: stat.size,
      note: topic.note,
    });
    console.log(`  ✓ ${(stat.size / 1024).toFixed(0)} KB`);
  }

  writeAnchorsMd(anchorMap, packManifest);
  console.log(`\nWrote reference/ANCHORS.md (${anchorMap.size} section ids)`);

  validateTopicCardRefs(anchorMap);
}

main();
