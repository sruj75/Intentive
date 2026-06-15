import assert from "node:assert/strict";
import test from "node:test";

import { createLangfuseFloorSource } from "../dist/index.js";

test("Langfuse floor source fetches the four procedure prompts at the requested label", async () => {
  const calls = [];
  const source = createLangfuseFloorSource({
    client: {
      getPrompt: async (name, version, options) => {
        calls.push({ name, version, options });
        return {
          name,
          version: name.endsWith("soul") ? 10 : 11,
          prompt: `${name} body`,
          toJSON: () => JSON.stringify({ name, version: name.endsWith("soul") ? 10 : 11 }),
        };
      },
    },
  });

  const floor = await source.fetch("production");

  assert.deepEqual(
    calls.map((call) => [call.name, call.options]),
    [
      ["companion-soul", { label: "production", type: "text" }],
      ["companion-agents", { label: "production", type: "text" }],
      ["companion-bootstrap", { label: "production", type: "text" }],
      ["companion-heartbeat", { label: "production", type: "text" }],
    ],
  );
  assert.equal(floor.documents.SOUL, "companion-soul body");
  assert.equal(floor.documents.HEARTBEAT, "companion-heartbeat body");
  assert.equal(floor.version, "SOUL:10,AGENTS:11,BOOTSTRAP:11,HEARTBEAT:11");
  assert.deepEqual(floor.langfusePrompts[0], { name: "companion-soul", version: 10 });
});
