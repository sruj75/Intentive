#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const sensorPath = new URL("./index.mjs", import.meta.url).pathname;
const repo = mkdtempSync(path.join(tmpdir(), "intentive-factory-report-"));

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
  writePackage("services/agent-runtime", {
    name: "@intentive/agent-runtime",
    dependencies: {
      "@intentive/protocol": "workspace:*",
    },
  });

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
    "services/agent-runtime/src/index.ts",
    'import { publicEvent } from "@intentive/protocol";\nexport const runtimeEvent = publicEvent;\n',
  );
  write(
    "apps/mobile/src/domains/chat/types/scaffold.ts",
    "export type ChatScaffold = { ready: boolean };\n",
  );
  write(
    "apps/mobile/test/events.test.ts",
    "import { publicEvent } from '@intentive/protocol';\npublicEvent;\n",
  );
  write(
    "tools/harness/behavior-proof.json",
    JSON.stringify(
      {
        slices: [
          {
            id: "mobile-behavior",
            workspace: "apps/mobile",
            label: "Mobile behavior",
            commands: [{ command: "pnpm", args: ["--dir", "apps/mobile", "test"] }],
          },
        ],
      },
      null,
      2,
    ),
  );
  write(
    "tools/harness/mobile.json",
    JSON.stringify(
      {
        name: "Mobile",
        scope: "apps/mobile",
        aliases: ["mobile"],
        sensors: [],
        requiredCommands: [{ command: "pnpm", args: ["--dir", "apps/mobile", "test"] }],
      },
      null,
      2,
    ),
  );

  git(["init"]);
  git(["config", "user.email", "sensor@example.test"]);
  git(["config", "user.name", "Sensor Test"]);
  git(["add", "."]);
  git(["commit", "-m", "initial"]);

  write(
    "packages/protocol/src/events.ts",
    ["export const publicEvent = 'event-v2';", "export const untestedEvent = 'untested';", ""].join(
      "\n",
    ),
  );
  write("apps/mobile/src/untracked.ts", "export const untracked = true;\n");

  const output = execFileSync(
    process.execPath,
    [sensorPath, "--repo", repo, "--format", "markdown", "--base", "HEAD"],
    { encoding: "utf8" },
  );
  const auditOutput = execFileSync(
    process.execPath,
    [sensorPath, "--repo", repo, "--format", "markdown", "--base", "HEAD", "--audit"],
    { encoding: "utf8" },
  );

  assert.match(output, /<!-- intentive:factory-report -->/);
  assert.match(output, /## Factory Radar/);
  assert.match(output, /### Radar/);
  assert.match(output, /#### Actionable Findings/);
  assert.match(output, /#### Changed Files/);
  assert.match(output, /`apps\/mobile\/src\/untracked\.ts`/);
  assert.match(output, /#### Behavior Coverage/);
  assert.match(output, /apps\/mobile: Mobile behavior \(present\)/);
  assert.match(output, /#### Repo-Wide Drift Summary/);
  assert.match(output, /\| Repo-wide findings hidden by default \|/);
  assert.match(output, /Run `pnpm sensor:factory-report --audit`/);
  assert.match(output, /apps\/mobile\/src\/domains\/chat\/types\/scaffold\.ts/);
  assert.match(output, /Untested export untestedEvent/);
  assert.doesNotMatch(output, /### Harness Health/);
  assert.doesNotMatch(output, /### Impact Radius/);
  assert.doesNotMatch(output, /### Improvement Handoff/);

  assert.match(auditOutput, /### Audit Details/);
  assert.match(auditOutput, /### Radar Metrics/);
  assert.match(auditOutput, /\| PR-tied findings \|/);
  assert.match(auditOutput, /### Impact Radius/);
  assert.match(auditOutput, /`packages\/protocol\/src\/events\.ts`: fan-in 1, fan-out 0/);
  assert.match(auditOutput, /`services\/agent-runtime`: .*depends on @intentive\/protocol/);
  assert.match(auditOutput, /### Harness Health/);
  assert.match(auditOutput, /### Improvement Handoff/);
  assert.match(auditOutput, /dependencies in apps\/mobile|Dependency Maintenance/);
  assert.match(output, /Factory improved/);
  assert.match(output, /Backlogged/);
  assert.match(output, /`stale-scaffold:apps\/mobile\/src\/domains\/chat\/types\/scaffold\.ts`/);
  assert.match(output, /`untested-export:packages\/protocol\/src\/events\.ts:untestedevent`/);
  assert.match(auditOutput, /### Finding Memory/);

  console.log("factory-report: fixture test passed");
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
