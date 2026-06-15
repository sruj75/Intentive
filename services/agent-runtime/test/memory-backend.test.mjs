import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryBackend, readUserProfile, userMemoryNamespace } from "../dist/index.js";

test("memory backend routes /memories/ through the persistent store backend", () => {
  const { backend } = createMemoryBackend({ store: fakeStore() });

  assert.equal(backend.routePrefixes.includes("/memories/"), true);
});

test("readUserProfile reads USER.md from the per-user memory namespace", async () => {
  const reads = [];
  const profile = await readUserProfile(
    {
      get: async (namespace, key) => {
        reads.push({ namespace, key });
        return { value: { content: "prefers concise check-ins" } };
      },
    },
    "user_1",
  );

  assert.equal(profile, "prefers concise check-ins");
  assert.deepEqual(reads, [{ namespace: ["memories", "user_1"], key: "/USER.md" }]);
});

test("readUserProfile returns an empty profile when USER.md is missing", async () => {
  assert.equal(await readUserProfile({ get: async () => null }, "user_1"), "");
});

test("userMemoryNamespace scopes memory by user_id", () => {
  assert.deepEqual(userMemoryNamespace("user_1"), ["memories", "user_1"]);
});

function fakeStore() {
  return {
    get: async () => null,
    put: async () => {},
    delete: async () => {},
    listNamespaces: async () => [],
    search: async () => [],
    batch: async () => [],
  };
}
