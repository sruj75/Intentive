import assert from "node:assert/strict";
import test from "node:test";

import { createLangfuseFloorSource, parseProcedureFloorBundle } from "../dist/index.js";

const bundle = [
  "# Intentive Desktop Performance Coach",
  "",
  "## File: SOUL.md",
  "",
  "soul body",
  "",
  "## File: AGENTS.md",
  "",
  "agents body",
  "",
  "## File: BOOTSTRAP.md",
  "",
  "bootstrap body",
  "",
  "## File: HEARTBEAT.md",
  "",
  "heartbeat body",
].join("\n");

test("Langfuse floor source fetches the canonical bundle at the requested label", async () => {
  const calls = [];
  const source = createLangfuseFloorSource({
    client: {
      getPrompt: async (name, version, options) => {
        calls.push({ name, version, options });
        return {
          name,
          version: 4,
          prompt: bundle,
          toJSON: () => JSON.stringify({ name, version: 4 }),
        };
      },
    },
  });

  const floor = await source.fetch("production");

  assert.deepEqual(calls, [
    {
      name: "intentive-runtime-bundle",
      version: undefined,
      options: { label: "production", type: "text" },
    },
  ]);
  assert.deepEqual(floor.documents, {
    SOUL: "soul body",
    AGENTS: "agents body",
    BOOTSTRAP: "bootstrap body",
    HEARTBEAT: "heartbeat body",
  });
  assert.equal(floor.version, "4");
  assert.deepEqual(floor.langfusePrompts, [{ name: "intentive-runtime-bundle", version: 4 }]);
});

test("bundle parser rejects missing, duplicate, and empty procedure documents", () => {
  assert.throws(
    () => parseProcedureFloorBundle(bundle.replace(/## File: HEARTBEAT\.md[\s\S]*$/, "")),
    /missing required documents: HEARTBEAT/,
  );
  assert.throws(
    () => parseProcedureFloorBundle(`${bundle}\n\n## File: SOUL.md\n\nduplicate`),
    /duplicate SOUL\.md/,
  );
  assert.throws(
    () => parseProcedureFloorBundle(bundle.replace("heartbeat body", "   ")),
    /empty HEARTBEAT\.md/,
  );
});
