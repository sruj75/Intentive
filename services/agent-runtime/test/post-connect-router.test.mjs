import assert from "node:assert/strict";
import test from "node:test";

import { createPostConnectRouter } from "../dist/index.js";

const session = {
  userId: "00000000-0000-4000-8000-000000000001",
  clientKind: "mobile",
  agentInstanceId: "agent_instance_1",
};

test("a History Backfill request is a read: it bypasses ingress and returns a snapshot response", async () => {
  let ingressCalls = 0;
  const readArgs = [];
  const snapshot = { messages: [], before_cursor: "3" };

  const route = createPostConnectRouter({
    ingress: () => {
      ingressCalls += 1;
    },
    conversation: {
      readSnapshot: async (userId, before, limit) => {
        readArgs.push([userId, before, limit]);
        return snapshot;
      },
    },
  });

  const response = await route(session, {
    type: "history_backfill_request",
    before_cursor: "53",
    limit: 25,
  });

  // The request never touches the ingress (ledger + queue) path.
  assert.equal(ingressCalls, 0);
  // It reads the older page for this User with the given cursor and limit.
  assert.deepEqual(readArgs, [[session.userId, "53", 25]]);
  // And replies with the snapshot wrapped in a backfill response frame.
  assert.deepEqual(response, {
    type: "history_backfill_response",
    session_snapshot: snapshot,
  });
});

test("a state-mutating event is delegated to ingress and produces no direct reply", async () => {
  let readCalls = 0;
  const seen = [];

  const route = createPostConnectRouter({
    ingress: (s, event) => {
      seen.push([s, event]);
    },
    conversation: {
      readSnapshot: async () => {
        readCalls += 1;
        return { messages: [], before_cursor: null };
      },
    },
  });

  const userMessage = {
    type: "user_message",
    message_id: "m1",
    body: "hello",
    sent_at: "2026-06-10T00:00:00.000Z",
  };
  const response = await route(session, userMessage);

  // Ingress owns it; the read path is untouched; nothing is sent straight back.
  assert.equal(readCalls, 0);
  assert.deepEqual(seen, [[session, userMessage]]);
  assert.equal(response, undefined);
});
