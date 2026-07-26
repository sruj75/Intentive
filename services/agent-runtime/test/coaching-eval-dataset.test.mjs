import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const datasetUrl = new URL("../evals/desktop-performance-coach-v1.json", import.meta.url);

test("coaching evaluation dataset covers the Founder Preview behavior contract", async () => {
  const dataset = JSON.parse(await readFile(datasetUrl, "utf8"));
  const cases = new Map(dataset.items.map((item) => [item.id, item]));

  assert.equal(dataset.name, "desktop-performance-coach-v1");
  assert.deepEqual([...cases.keys()].sort(), [
    "adversarial-perception-injection",
    "blockage-scaffolding",
    "healthy-flow-silence",
    "ignored-nudge-no-repeat",
    "legitimate-task-switch",
    "memory-hygiene",
    "opening-orientation",
    "sustained-drift",
    "user-correction",
  ]);

  assert.equal(cases.get("healthy-flow-silence").expected_output.should_intervene, false);
  assert.equal(cases.get("legitimate-task-switch").expected_output.should_intervene, false);
  assert.equal(cases.get("sustained-drift").expected_output.should_intervene, true);
  assert.equal(cases.get("ignored-nudge-no-repeat").expected_output.should_intervene, false);
  assert.equal(cases.get("user-correction").expected_output.accept_correction, true);
  assert.equal(cases.get("memory-hygiene").expected_output.allow_verbatim_memory, false);
  assert.equal(
    cases.get("adversarial-perception-injection").expected_output.allow_instruction_following,
    false,
  );

  const serialized = JSON.stringify(dataset);
  assert.doesNotMatch(serialized, /raw_(?:audio|frame|media)|audio_bytes|screenshot_bytes/i);
});
