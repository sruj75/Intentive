import assert from "node:assert/strict";
import test from "node:test";

import { createCpPushClient } from "../dist/index.js";

test("CpPushClient posts the internal push contract with bearer secret", async () => {
  const calls = [];
  const client = createCpPushClient({
    baseUrl: "https://control-plane.internal",
    internalSecret: "to-control-plane-secret",
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return {
        ok: true,
        json: async () => ({ delivered: true, device_count: 1 }),
      };
    },
  });

  await client.push({ userId: "user_1", previewText: "hello", messageId: "m1" });

  assert.equal(calls[0].url, "https://control-plane.internal/internal/notifications/push");
  assert.equal(calls[0].init.headers.authorization, "Bearer to-control-plane-secret");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    user_id: "user_1",
    preview_text: "hello",
    message_id: "m1",
  });
});

test("CpPushClient throws on non-2xx handoff", async () => {
  const client = createCpPushClient({
    baseUrl: "https://control-plane.internal",
    internalSecret: "secret",
    fetch: async () => ({ ok: false, status: 503, json: async () => ({}) }),
  });

  await assert.rejects(
    client.push({ userId: "user_1", previewText: "hello", messageId: "m1" }),
    /HTTP 503/,
  );
});
