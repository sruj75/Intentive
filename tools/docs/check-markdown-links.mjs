#!/usr/bin/env node
import { open, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function shouldCheckFile(relativePath) {
  if (
    relativePath === "README.md" ||
    relativePath === "AGENTS.md" ||
    relativePath === "ARCHITECTURE.md"
  ) {
    return true;
  }

  if (relativePath.startsWith("docs/")) {
    return true;
  }

  if (/^(apps|services)\/[^/]+\/(AGENTS|ARCHITECTURE)\.md$/.test(relativePath)) {
    return true;
  }

  if (relativePath === "packages/AGENTS.md") {
    return true;
  }

  if (relativePath === "services/agent-runtime/reference/AGENTS.md") {
    return true;
  }

  if (/^packages\/[^/]+\/(README|ARCHITECTURE)\.md$/.test(relativePath)) {
    return true;
  }

  return false;
}

async function walk({ dir, repoRoot, mdFiles }) {
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
      await walk({ dir: fullPath, repoRoot, mdFiles });
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

export async function checkMarkdownLinks({ repoRoot = process.cwd(), openTarget = open } = {}) {
  const mdFiles = [];
  const headingCache = new Map();
  const failures = [];

  await walk({ dir: repoRoot, repoRoot, mdFiles });

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

        let targetFile;
        try {
          targetFile = await openTarget(resolvedPath, "r");
        } catch {
          failures.push(
            `${path.relative(repoRoot, mdFile)}:${lineIndex + 1} missing target ${rawTarget}`,
          );
          continue;
        }

        try {
          let fileStats;
          try {
            fileStats = await targetFile.stat();
          } catch {
            failures.push(
              `${path.relative(repoRoot, mdFile)}:${lineIndex + 1} missing target ${rawTarget}`,
            );
            continue;
          }

          if (anchorPart && fileStats.isFile() && resolvedPath.toLowerCase().endsWith(".md")) {
            const linkedContent = await targetFile.readFile("utf8");
            const linkedAnchors = extractHeadings(linkedContent);
            if (!linkedAnchors.has(anchorPart)) {
              failures.push(
                `${path.relative(repoRoot, mdFile)}:${lineIndex + 1} broken anchor ${rawTarget}`,
              );
            }
          }
        } finally {
          await targetFile.close();
        }
      }
    }
  }

  return {
    markdownFilesChecked: mdFiles.length,
    failures,
  };
}

async function main() {
  const result = await checkMarkdownLinks();

  if (result.failures.length > 0) {
    console.error("Markdown link check failed:\n");
    for (const failure of result.failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(
    `Markdown link check passed (${result.markdownFilesChecked} markdown files scanned).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("Markdown link check crashed:", error);
    process.exit(1);
  });
}
