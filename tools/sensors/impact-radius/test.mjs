#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const sensorPath = new URL("./index.mjs", import.meta.url).pathname;
const repo = mkdtempSync(path.join(tmpdir(), "intentive-impact-radius-"));

try {
  write("package.json", JSON.stringify({ name: "fixture", private: true }, null, 2));
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
  writePackage("apps/desktop", {
    name: "@intentive/desktop",
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
  write("packages/protocol/src/events.ts", 'export const connect = "connect";\n');
  write(
    "apps/mobile/src/index.ts",
    'import { connect } from "@intentive/protocol";\nexport const mobileConnect = connect;\n',
  );
  write(
    "apps/desktop/src/index.ts",
    'import { connect } from "@intentive/protocol";\nexport const desktopConnect = connect;\n',
  );
  write(
    "services/agent-runtime/src/index.ts",
    'import { connect } from "@intentive/protocol";\nexport const runtimeConnect = connect;\n',
  );
  write(
    "services/agent-runtime/src/cross.ts",
    'import { mobileConnect } from "../../../apps/mobile/src/index.js";\nexport const crossed = mobileConnect;\n',
  );

  git(["init"]);
  git(["config", "user.email", "sensor@example.test"]);
  git(["config", "user.name", "Sensor Test"]);
  git(["add", "."]);
  git(["commit", "-m", "initial"]);

  write("packages/protocol/src/events.ts", 'export const connect = "connect-v2";\n');
  write("apps/mobile/src/untracked.ts", "export const untracked = true;\n");

  const output = execFileSync(process.execPath, [sensorPath, "--repo", repo], {
    encoding: "utf8",
  });

  assert.match(output, /Impact Radius Sensor/);
  assert.match(output, /- apps\/mobile\/src\/untracked\.ts/);
  assert.match(output, /- packages\/protocol\/src\/events\.ts/);
  assert.match(output, /packages\/protocol\/src\/events\.ts: fan-in 1, fan-out 0/);
  assert.match(
    output,
    /services\/agent-runtime\/src\/cross\.ts \(services\/agent-runtime\) -> apps\/mobile\/src\/index\.ts \(apps\/mobile\)/,
  );
  assert.doesNotMatch(
    output,
    /apps\/mobile\/src\/index\.ts \(apps\/mobile\) -> packages\/protocol/,
  );
  assert.doesNotMatch(
    output,
    /services\/agent-runtime\/src\/index\.ts \(services\/agent-runtime\) -> packages\/protocol/,
  );
  assert.match(output, /packages\/protocol\/src\/events\.ts \(packages\/protocol\): connect/);
  assert.match(output, /apps\/mobile: .*packages\/protocol review hint/);
  assert.match(output, /apps\/desktop: .*depends on @intentive\/protocol/);
  assert.match(output, /services\/agent-runtime: .*imports packages\/protocol\/src\/index\.ts/);

  console.log("impact-radius: fixture test passed");
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
