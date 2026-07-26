import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("delivery mode and message shape stay coupled at compile time", () => {
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "tsc",
      "--noEmit",
      "--strict",
      "--skipLibCheck",
      "--target",
      "ES2022",
      "--module",
      "ESNext",
      "--moduleResolution",
      "Bundler",
      "test/type-contracts/delivery.ts",
    ],
    { cwd: serviceRoot, encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stdout + result.stderr);
});
