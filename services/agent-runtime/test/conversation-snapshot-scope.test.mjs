import assert from "node:assert/strict";
import test from "node:test";

import { createConversationRepo } from "../dist/index.js";

test("ordinary snapshots exclude window-bound coaching rows before pagination", async () => {
  const calls = [];
  const conversation = createConversationRepo(capturingSql(calls));

  await conversation.readSnapshot(
    "00000000-0000-4000-8000-000000000001",
    undefined,
    50,
    "ordinary",
  );

  assert.match(calls[0].text, /\(\?\s+OR\s+window_id IS NULL\)/i);
  assert.equal(calls[0].values[1], false);
});

test("Desktop snapshots may include window-bound rows as transcript data", async () => {
  const calls = [];
  const conversation = createConversationRepo(capturingSql(calls));

  await conversation.readSnapshot("00000000-0000-4000-8000-000000000001", "42", 25, "desktop");

  assert.match(calls[0].text, /\(\?\s+OR\s+window_id IS NULL\)/i);
  assert.equal(calls[0].values[1], true);
});

function capturingSql(calls) {
  return (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return Promise.resolve([]);
  };
}
