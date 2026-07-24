#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const sensorPath = new URL("./index.mjs", import.meta.url).pathname;
const repo = mkdtempSync(path.join(tmpdir(), "intentive-contract-drift-"));

try {
  write("package.json", JSON.stringify({ name: "fixture", private: true }, null, 2));
  write(
    "packages/protocol/src/index.ts",
    `
import { z } from "zod";
export const context_snapshot = z.object({ type: z.literal("context_snapshot"), summary: z.string() }).strict();
export type ContextSnapshot = z.infer<typeof context_snapshot>;
export const user_message = z.object({ type: z.literal("user_message"), body: z.string() }).strict();
export type UserMessage = z.infer<typeof user_message>;
`,
  );
  write(
    "packages/api-contract/src/public.ts",
    `
import { z } from "zod";
export const GetAgentResponse = z.object({ agent_instance_id: z.string(), ws_url: z.string(), runtime_jwt: z.string() }).strict();
export type GetAgentResponse = z.infer<typeof GetAgentResponse>;
`,
  );
  write("packages/api-contract/src/internal.ts", 'import { z } from "zod";\n');

  write(
    "apps/mobile/src/good-protocol.ts",
    `
import type { ContextSnapshot } from "@intentive/protocol";
export const snapshot: ContextSnapshot = { type: "context_snapshot", summary: "ok" };
`,
  );
  write(
    "services/control-plane/src/good-api.ts",
    `
import type { GetAgentResponse } from "@intentive/api-contract";
export const response: GetAgentResponse = { agent_instance_id: "a", ws_url: "wss://runtime", runtime_jwt: "jwt" };
`,
  );
  write(
    "services/control-plane/src/env.ts",
    `
import { z } from "zod";
export const EnvSchema = z.object({ PORT: z.string() }).strict();
`,
  );

  assert.equal(runSensor().status, 0);

  write(
    "apps/mobile/src/bad-protocol-schema.ts",
    `
import { z } from "zod";
export const LocalContextSnapshot = z.object({ type: z.literal("context_snapshot"), summary: z.string() }).strict();
`,
  );
  let result = runSensor();
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Import from @intentive\/protocol; do not redefine this wire shape locally\./,
  );
  assert.match(result.stderr, /context_snapshot/);
  rm("apps/mobile/src/bad-protocol-schema.ts");

  write(
    "apps/mobile/src/bad-protocol-object.ts",
    `
export const snapshot = { type: "context_snapshot", summary: "oops" };
`,
  );
  result = runSensor();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /context_snapshot/);
  rm("apps/mobile/src/bad-protocol-object.ts");

  write(
    "services/control-plane/src/bad-api-name.ts",
    `
import { z } from "zod";
export const GetAgentResponse = z.object({ agent_instance_id: z.string(), ws_url: z.string(), runtime_jwt: z.string() }).strict();
`,
  );
  result = runSensor();
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Import from @intentive\/api-contract; do not redefine this HTTP contract locally\./,
  );
  assert.match(result.stderr, /GetAgentResponse/);
  rm("services/control-plane/src/bad-api-name.ts");

  write(
    "services/control-plane/src/bad-api-shape.ts",
    `
export const response = { agent_instance_id: "a", ws_url: "wss://runtime", runtime_jwt: "jwt" };
`,
  );
  result = runSensor();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /GetAgentResponse/);

  console.log("contract-drift: fixture test passed");
} finally {
  rmSync(repo, { recursive: true, force: true });
}

function runSensor() {
  try {
    const stdout = execFileSync(process.execPath, [sensorPath, "--repo", repo], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      status: error.status ?? 1,
      stdout: error.stdout?.toString() ?? "",
      stderr: error.stderr?.toString() ?? "",
    };
  }
}

function write(relPath, contents) {
  const absPath = path.join(repo, relPath);
  mkdirSync(path.dirname(absPath), { recursive: true });
  writeFileSync(absPath, contents.trimStart());
}

function rm(relPath) {
  rmSync(path.join(repo, relPath), { force: true });
}
