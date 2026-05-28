#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const ignoredDirs = new Set([
  ".git",
  "node_modules",
  ".turbo",
  "dist",
  "build",
  "coverage",
  ".next",
  ".expo",
  "target",
  ".scratch",
]);

const mdFiles = [];

function shouldCheckFile(relativePath) {
  if (relativePath === "README.md" || relativePath === "AGENTS.md") {
    return true;
  }

  if (relativePath.startsWith("docs/")) {
    return true;
  }

  if (/^(apps|services)\/[^/]+\/AGENTS\.md$/.test(relativePath)) {
    return true;
  }

  if (/^packages\/[^/]+\/(README|ARCHITECTURE)\.md$/.test(relativePath)) {
    return true;
  }

  return false;
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      if (entry.name !== ".scratch") {
        continue;
      }
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) {
        continue;
      }
      await walk(fullPath);
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      const relativePath = path.relative(repoRoot, fullPath);
      if (shouldCheckFile(relativePath)) {
        mdFiles.push(fullPath);
      }
    }
  }
}

function slugifyHeading(raw) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function extractHeadings(markdown) {
  const anchors = new Set();
  const lines = markdown.split(/\r?\n/);

  for (const line of lines) {
    if (!line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^#{1,6}\s+(.*)$/);
    if (!match) {
      continue;
    }

    const headingText = match[1].replace(/\s+#*\s*$/, "").trim();
    const slug = slugifyHeading(headingText);
    if (slug) {
      anchors.add(slug);
    }
  }

  return anchors;
}

function isExternalLink(target) {
  return (
    target.startsWith("http://") ||
    target.startsWith("https://") ||
    target.startsWith("mailto:") ||
    target.startsWith("tel:")
  );
}

const linkPattern = /(?<!!)\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

async function main() {
  await walk(repoRoot);

  const headingCache = new Map();
  const failures = [];

  for (const mdFile of mdFiles) {
    const content = await readFile(mdFile, "utf8");
    const lines = content.split(/\r?\n/);

    if (!headingCache.has(mdFile)) {
      headingCache.set(mdFile, extractHeadings(content));
    }

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      linkPattern.lastIndex = 0;

      let match;
      while ((match = linkPattern.exec(line)) !== null) {
        const rawTarget = match[1]?.trim();
        if (!rawTarget || isExternalLink(rawTarget)) {
          continue;
        }

        if (rawTarget.startsWith("<") && rawTarget.endsWith(">")) {
          continue;
        }

        if (rawTarget.startsWith("#")) {
          const anchor = rawTarget.slice(1);
          const anchors = headingCache.get(mdFile);
          if (!anchors.has(anchor)) {
            failures.push(
              `${path.relative(repoRoot, mdFile)}:${lineIndex + 1} broken anchor #${anchor}`,
            );
          }
          continue;
        }

        const [filePart, anchorPart] = rawTarget.split("#");
        const resolvedPath = path.resolve(path.dirname(mdFile), filePart);

        let exists = false;
        let fileStats = null;
        try {
          fileStats = await stat(resolvedPath);
          exists = true;
        } catch {
          exists = false;
        }

        if (!exists) {
          failures.push(
            `${path.relative(repoRoot, mdFile)}:${lineIndex + 1} missing target ${rawTarget}`,
          );
          continue;
        }

        if (anchorPart && fileStats?.isFile() && resolvedPath.toLowerCase().endsWith(".md")) {
          if (!headingCache.has(resolvedPath)) {
            const linkedContent = await readFile(resolvedPath, "utf8");
            headingCache.set(resolvedPath, extractHeadings(linkedContent));
          }

          const linkedAnchors = headingCache.get(resolvedPath);
          if (!linkedAnchors.has(anchorPart)) {
            failures.push(
              `${path.relative(repoRoot, mdFile)}:${lineIndex + 1} broken anchor ${rawTarget}`,
            );
          }
        }
      }
    }
  }

  if (failures.length > 0) {
    console.error("Markdown link check failed:\n");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(`Markdown link check passed (${mdFiles.length} markdown files scanned).`);
}

main().catch((error) => {
  console.error("Markdown link check crashed:", error);
  process.exit(1);
});
