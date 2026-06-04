#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const sensorPath = new URL("./index.mjs", import.meta.url).pathname;
const repo = mkdtempSync(path.join(tmpdir(), "intentive-harness-health-"));

try {
  write("CONTEXT-MAP.md", "**Companion**: Canonical term.\n_Avoid_: bot\n");
  write("packages/CONTEXT.md", "");
  writePackage("packages/protocol", {
    name: "@intentive/protocol",
    exports: {
      ".": {
        types: "./src/index.ts",
        default: "./src/index.ts",
      },
    },
  });
  writePackage("apps/mobile", {
    name: "@intentive/mobile",
    dependencies: {
      "@intentive/protocol": "workspace:*",
    },
  });
  write(
    ".github/workflows/audit.yml",
    "jobs:\n  audit:\n    steps:\n      - run: echo ignore: RUSTSEC-1\n",
  );
  write("packages/protocol/src/index.ts", 'export * from "./events.js";\n');
  write(
    "packages/protocol/src/events.ts",
    [
      "export const publicEvent = 'event';",
      "export const untestedEvent = 'untested';",
      "// bot vocabulary drift",
      "",
    ].join("\n"),
  );
  write(
    "apps/mobile/src/index.ts",
    'import { publicEvent } from "@intentive/protocol";\nexport const mobileEvent = publicEvent;\n',
  );
  write(
    "apps/mobile/src/consumer.ts",
    'import { publicEvent } from "@intentive/protocol";\nexport const consumed = publicEvent;\n',
  );
  write(
    "apps/mobile/src/domains/chat/types/scaffold.ts",
    "export type ChatScaffold = { ready: boolean };\n",
  );
  write(
    "apps/mobile/test/scaffold.test.mjs",
    "import test from 'node:test';\ntest('scaffold', () => {});\n",
  );
  write(
    "apps/mobile/test/events.test.ts",
    "import { publicEvent } from '@intentive/protocol';\npublicEvent;\n",
  );
  write(
    "apps/mobile/src/ignored.ts",
    "// eslint-disable-next-line no-console\nconsole.log('x');\n",
  );
  write(
    "apps/mobile/src/large.ts",
    `${Array.from({ length: 260 }, (_, index) => `export const l${index} = ${index};`).join("\n")}\n`,
  );

  git(["init"]);
  git(["config", "user.email", "sensor@example.test"]);
  git(["config", "user.name", "Sensor Test"]);
  git(["add", "."]);
  git(["commit", "-m", "initial"]);

  write("apps/mobile/src/changed.ts", "export const changed = true;\n");

  const output = execFileSync(
    process.execPath,
    [sensorPath, "--repo", repo, "--format", "markdown", "--base", "HEAD"],
    { encoding: "utf8" },
  );

  assert.match(output, /<!-- intentive:harness-health -->/);
  assert.match(output, /## Harness Health/);
  assert.match(output, /`apps\/mobile\/src\/changed\.ts`/);
  assert.match(output, /apps\/mobile\/test\/scaffold\.test\.mjs/);
  assert.match(output, /apps\/mobile\/src\/large\.ts`: 261 lines \(threshold 250\)/);
  assert.match(output, /packages\/protocol\/src\/index\.ts`: fan-in 3/);
  assert.match(output, /apps\/mobile\/src\/ignored\.ts:1`: eslint-disable/);
  assert.match(output, /packages\/protocol\/src\/events\.ts:3`: "bot" -> "Companion"/);
  assert.match(output, /`untestedEvent` from `packages\/protocol\/src\/events\.ts`/);
  assert.match(output, /Dependency Freshness/);
  assert.match(output, /Advisory: use this report to steer review attention/);

  console.log("harness-health: fixture test passed");
} finally {
  rmSync(repo, { recursive: true, force: true });
}

function writePackage(relRoot, packageJson) {
  write(
    `${relRoot}/package.json`,
    JSON.stringify(
      {
        version: "0.0.0",
        private: true,
        ...packageJson,
      },
      null,
      2,
    ),
  );
}

function write(relPath, contents) {
  const absPath = path.join(repo, relPath);
  mkdirSync(path.dirname(absPath), { recursive: true });
  writeFileSync(absPath, contents);
}

function git(args) {
  execFileSync("git", ["-C", repo, ...args], { stdio: "ignore" });
}
