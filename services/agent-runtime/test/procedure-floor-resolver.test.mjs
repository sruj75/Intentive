import assert from "node:assert/strict";
import test from "node:test";

import { createProcedureFloorResolver } from "../dist/index.js";

const fallbackFloor = floor("fallback");
const sourceFloor = floor("source");

test("procedure floor resolver uses the configured source when it resolves", async () => {
  const resolver = createProcedureFloorResolver({
    source: { fetch: async () => sourceFloor },
    fallback: { fetch: async () => fallbackFloor },
  });

  assert.equal((await resolver.resolve("production")).version, "source");
});

test("procedure floor resolver falls back when the configured source throws", async () => {
  const resolver = createProcedureFloorResolver({
    source: {
      fetch: async () => {
        throw new Error("langfuse unavailable");
      },
    },
    fallback: { fetch: async () => fallbackFloor },
  });

  assert.equal((await resolver.resolve("production")).version, "fallback");
});

test("procedure floor resolver falls back when Langfuse is unconfigured", async () => {
  const resolver = createProcedureFloorResolver({
    source: null,
    fallback: { fetch: async () => fallbackFloor },
  });

  assert.equal((await resolver.resolve("production")).version, "fallback");
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
