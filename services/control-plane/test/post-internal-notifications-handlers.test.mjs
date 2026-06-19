import assert from "node:assert/strict";
import test from "node:test";

import { createPostInternalNotificationsCheckReceiptsHandler } from "../dist/domains/notifications/ui/post-internal-notifications-check-receipts.js";
import { createPostInternalNotificationsPushHandler } from "../dist/domains/notifications/ui/post-internal-notifications-push.js";

test("push handler rejects missing/wrong internal secret before touching the service", async () => {
  const handler = createPostInternalNotificationsPushHandler({
    expectedSecret: "expected",
    notifications: {
      pushToUser: async () => assert.fail("service must not be called"),
    },
  });

  assert.equal((await handler.handle({ authorization: null, body: {} })).status, 401);
  assert.equal((await handler.handle({ authorization: "Bearer wrong", body: {} })).status, 401);
});

test("push handler maps the contract body into pushToUser", async () => {
  const seen = [];
  const res = await createPostInternalNotificationsPushHandler({
    expectedSecret: "expected",
    notifications: {
      pushToUser: async (input) => {
        seen.push(input);
        return { delivered: true, deviceCount: 2 };
      },
    },
  }).handle({
    authorization: "Bearer expected",
    body: { user_id: "u_1", preview_text: "hello", message_id: "m_1" },
  });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { delivered: true, device_count: 2 });
  assert.deepEqual(seen, [{ userId: "u_1", previewText: "hello", messageId: "m_1" }]);
});

test("receipt-check handler uses the maintenance secret and forwards the optional limit", async () => {
  const seen = [];
  const res = await createPostInternalNotificationsCheckReceiptsHandler({
    expectedSecret: "maint",
    notifications: {
      checkPendingReceipts: async (input) => {
        seen.push(input);
        return { checked: 5, cleared: 1 };
      },
    },
  }).handle({
    authorization: "Bearer maint",
    body: { limit: 5 },
  });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { checked: 5, cleared: 1 });
  assert.deepEqual(seen, [{ limit: 5 }]);
});

test("receipt-check handler rejects the Runtime inbound secret", async () => {
  const res = await createPostInternalNotificationsCheckReceiptsHandler({
    expectedSecret: "maintenance-only",
    notifications: {
      checkPendingReceipts: async () => assert.fail("service must not be called"),
    },
  }).handle({ authorization: "Bearer runtime-secret", body: {} });

  assert.equal(res.status, 401);
});
