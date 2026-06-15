import assert from "node:assert/strict";
import test from "node:test";

import { createBundledFallbackSource } from "../dist/index.js";

test("bundled fallback resolves the minimal Procedure Floor", async () => {
  const floor = await createBundledFallbackSource().fetch("production");

  assert.equal(floor.version, "fallback");
  assert.deepEqual(Object.keys(floor.documents).sort(), [
    "AGENTS",
    "BOOTSTRAP",
    "HEARTBEAT",
    "SOUL",
  ]);
  assert.deepEqual(floor.langfusePrompts, []);
});
