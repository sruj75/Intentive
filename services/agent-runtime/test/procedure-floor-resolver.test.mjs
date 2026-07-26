import assert from "node:assert/strict";
import test from "node:test";

import { createProcedureFloorResolver } from "../dist/index.js";

const sourceFloor = floor("source");

test("procedure floor resolver uses the configured source when it resolves", async () => {
  const resolver = createProcedureFloorResolver({
    source: { fetch: async () => sourceFloor },
  });

  assert.equal((await resolver.resolve("production")).version, "source");
});

test("procedure floor resolver propagates Langfuse failures", async () => {
  const resolver = createProcedureFloorResolver({
    source: {
      fetch: async () => {
        throw new Error("langfuse unavailable");
      },
    },
  });

  await assert.rejects(() => resolver.resolve("production"), /langfuse unavailable/);
});

test("procedure floor resolver rejects a missing Langfuse label", async () => {
  const resolver = createProcedureFloorResolver({
    source: { fetch: async () => null },
  });

  await assert.rejects(
    () => resolver.resolve("production"),
    /Procedure Floor label "production" is unavailable/,
  );
});

function floor(version) {
  return {
    version,
    documents: {
      SOUL: "soul",
      AGENTS: "agents",
      BOOTSTRAP: "bootstrap",
      HEARTBEAT: "heartbeat",
    },
    langfusePrompts: [],
  };
}
