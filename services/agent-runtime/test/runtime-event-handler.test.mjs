import assert from "node:assert/strict";
import test from "node:test";

import { createRuntimeIngressHandler, createUserQueue } from "../dist/index.js";

const session = {
  userId: "00000000-0000-4000-8000-000000000001",
  clientKind: "mobile",
  agentInstanceId: "00000000-0000-4000-8000-000000000010",
};

test("runtime ingress commits inside the per-User queue so failed commits can be retried", async () => {
  const queue = createUserQueue();
  const attempts = [];
  let failOnce = true;
  const handleRuntimeIngress = createRuntimeIngressHandler({
    queue,
    commit: async (_session, event) => {
      attempts.push(event.message_id);
      if (failOnce) {
        failOnce = false;
        throw new Error("projection failed");
      }
    },
  });

  await assert.rejects(handleRuntimeIngress(session, userMessage("message_1")));
  await handleRuntimeIngress(session, userMessage("message_1"));

  assert.deepEqual(attempts, ["message_1", "message_1"]);
});

function userMessage(messageId) {
  return {
    type: "user_message",
    message_id: messageId,
    body: "hello",
    sent_at: "2026-06-09T00:00:00.000Z",
  };
}
