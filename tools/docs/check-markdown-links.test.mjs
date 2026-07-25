#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { open, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkMarkdownLinks } from "./check-markdown-links.mjs";

const repo = mkdtempSync(path.join(tmpdir(), "intentive-markdown-links-"));

try {
  write("README.md", "[missing](docs/missing.md#heading)\n");
  let result = await checkMarkdownLinks({ repoRoot: repo });
  assert.deepEqual(result.failures, ["README.md:1 missing target docs/missing.md#heading"]);

  resetFixture();
  write("README.md", "[directory](docs#ignored)\n[plain text](notes.txt#ignored)\n");
  write("notes.txt", "not markdown\n");
  result = await checkMarkdownLinks({ repoRoot: repo });
  assert.deepEqual(result.failures, []);

  resetFixture();
  write("README.md", "[valid](docs/target.md#valid-heading)\n");
  write("docs/target.md", "# Valid heading\n");
  result = await checkMarkdownLinks({ repoRoot: repo });
  assert.deepEqual(result.failures, []);

  resetFixture();
  write("README.md", "[stable](target.md#stable-heading)\n");
  write("target.md", "# Stable heading\n");
  write("replacement.md", "# Replacement heading\n");

  const targetPath = path.join(repo, "target.md");
  const replacedPath = path.join(repo, "target-before-replacement.md");
  let replacedTarget = false;
  result = await checkMarkdownLinks({
    repoRoot: repo,
    openTarget: async (filePath, flags) => {
      const fileHandle = await open(filePath, flags);
      if (filePath === targetPath) {
        renameSync(targetPath, replacedPath);
        renameSync(path.join(repo, "replacement.md"), targetPath);
        replacedTarget = true;
      }
      return fileHandle;
    },
  });

  assert.equal(replacedTarget, true);
  assert.equal(await readFile(targetPath, "utf8"), "# Replacement heading\n");
  assert.deepEqual(result.failures, []);

  resetFixture();
  write(
    "README.md",
    "[first inode](target.md#first-heading)\n[replacement inode](target.md#replacement-heading)\n",
  );
  write("target.md", "# First heading\n");
  write("replacement.md", "# Replacement heading\n");

  let targetOpenCount = 0;
  result = await checkMarkdownLinks({
    repoRoot: repo,
    openTarget: async (filePath, flags) => {
      if (filePath === targetPath) {
        targetOpenCount += 1;
        if (targetOpenCount === 2) {
          renameSync(targetPath, replacedPath);
          renameSync(path.join(repo, "replacement.md"), targetPath);
        }
      }
      return open(filePath, flags);
    },
  });

  assert.equal(targetOpenCount, 2);
  assert.deepEqual(result.failures, []);

  console.log("markdown-links: fixture test passed");
} finally {
  rmSync(repo, { recursive: true, force: true });
}

function resetFixture() {
  rmSync(repo, { recursive: true, force: true });
  mkdirSync(path.join(repo, "docs"), { recursive: true });
}

function write(relativePath, contents) {
  const absolutePath = path.join(repo, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
}
