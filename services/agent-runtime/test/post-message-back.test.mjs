import assert from "node:assert/strict";
import test from "node:test";

import {
  createCoachingPostMessageBack,
  createCoachingPostMessageBackTool,
  createPostMessageBack,
  createPostMessageBackTool,
  createTurnEffectGuard,
} from "../dist/index.js";

test("ordinary postMessageBack preserves the windowless stream-or-push path", async () => {
  const order = [];
  const entries = [];
  const deliveries = [];
  const postMessageBack = createPostMessageBack({
    newMessageId: () => "pmb_1",
    conversation: {
      append: async (entry) => {
        order.push("append");
        entries.push(entry);
      },
    },
    deliveryPort: {
      deliverOrdinaryProactive: async (message) => {
        order.push("deliver");
        deliveries.push(message);
      },
    },
  });

  const result = await postMessageBack("user_1", "go drink water");

  assert.deepEqual(order, ["append", "deliver"]);
  assert.deepEqual(result, { messageId: "pmb_1" });
  assert.deepEqual(entries, [
    {
      userId: "user_1",
      messageId: "pmb_1",
      author: "companion",
      body: "go drink water",
      viaPostMessageBack: true,
    },
  ]);
  assert.deepEqual(deliveries, [
    {
      userId: "user_1",
      messageId: "pmb_1",
      body: "go drink water",
    },
  ]);
});

test("coaching Post-Message-Back revalidates the window before persistence", async () => {
  let appendCalls = 0;
  let deliveryCalls = 0;
  const authorizations = [];
  const postMessageBack = createCoachingPostMessageBack({
    connections: alwaysActiveConnections,
    conversation: {
      appendCanonical: async () => {
        appendCalls += 1;
        return "stale observation";
      },
    },
    deliveryPort: {
      deliverCoachingProactive: async () => {
        deliveryCalls += 1;
      },
    },
    authorize: async (...args) => {
      authorizations.push(args);
      return false;
    },
  });
  const context = {
    windowId: "window_1",
    evidenceVersion: "v1",
    evidenceCursorStart: 4,
    evidenceCursorEnd: 8,
  };

  await assert.rejects(
    postMessageBack("user_1", "stale observation", context),
    /active coaching window/,
  );
  assert.deepEqual(authorizations, [["user_1", context]]);
  assert.equal(appendCalls, 0);
  assert.equal(deliveryCalls, 0);
});

test("coaching Post-Message-Back reuses one durable identity for duplicate calls and retries", async () => {
  const entries = [];
  const deliveries = [];
  let canonicalBody;
  const postMessageBack = createCoachingPostMessageBack({
    connections: alwaysActiveConnections,
    conversation: {
      appendCanonical: async (entry) => {
        entries.push(entry);
        canonicalBody ??= entry.body;
        return canonicalBody;
      },
    },
    deliveryPort: {
      deliverCoachingProactive: async (message) => {
        deliveries.push(message);
        return true;
      },
    },
    authorize: async () => true,
  });
  const context = {
    windowId: "11111111-1111-4111-8111-111111111111",
    evidenceVersion: "11111111-1111-4111-8111-111111111111:4-8",
    evidenceCursorStart: 4,
    evidenceCursorEnd: 8,
  };

  const first = await postMessageBack("user_1", "One concise nudge.", context);
  // This models both a duplicate tool call and a retry after the first send:
  // identity comes from the authenticated turn bounds, never generated afresh.
  const retry = await postMessageBack("user_1", "A retried wording.", context);

  assert.equal(retry.messageId, first.messageId);
  assert.match(first.messageId, /^intervention:[a-f0-9]{64}$/);
  assert.deepEqual(
    entries.map((entry) => entry.messageId),
    [first.messageId, first.messageId],
  );
  assert.deepEqual(
    deliveries.map((message) => message.messageId),
    [first.messageId, first.messageId],
  );
  assert.deepEqual(
    deliveries.map((message) => message.body),
    ["One concise nudge.", "One concise nudge."],
  );

  const nextRange = await postMessageBack("user_1", "A later nudge.", {
    ...context,
    evidenceVersion: "11111111-1111-4111-8111-111111111111:9-12",
    evidenceCursorStart: 9,
    evidenceCursorEnd: 12,
  });
  assert.notEqual(nextRange.messageId, first.messageId);
});

test("coaching post_message_back binds hidden turn bounds and exposes only body", async () => {
  const calls = [];
  const postMessageBack = async (userId, body, context) => {
    calls.push([userId, body, context]);
    return { messageId: "pmb_1" };
  };
  const effects = createTurnEffectGuard();
  const pmbTool = createCoachingPostMessageBackTool({
    userId: "user_1",
    windowId: "window_1",
    evidenceVersion: "v4",
    evidenceCursorStart: 4,
    evidenceCursorEnd: 8,
    postMessageBack,
    effects,
  });

  const result = await pmbTool.invoke({ body: "time to move" });

  assert.equal(pmbTool.name, "post_message_back");
  assert.deepEqual(calls, [
    [
      "user_1",
      "time to move",
      {
        windowId: "window_1",
        evidenceVersion: "v4",
        evidenceCursorStart: 4,
        evidenceCursorEnd: 8,
      },
    ],
  ]);
  assert.deepEqual(Object.keys(pmbTool.schema.shape), ["body"]);
  assert.match(result, /pmb_1/);
  assert.doesNotThrow(() => effects.assertSucceeded());
});

test("coaching post_message_back trims bodies and rejects whitespace-only interventions", async () => {
  const calls = [];
  const effects = createTurnEffectGuard();
  const pmbTool = createCoachingPostMessageBackTool({
    userId: "user_1",
    windowId: "window_1",
    evidenceVersion: "v4",
    evidenceCursorStart: 4,
    evidenceCursorEnd: 8,
    postMessageBack: async (...args) => {
      calls.push(args);
      return { messageId: "pmb_1" };
    },
    effects,
  });

  await assert.rejects(pmbTool.invoke({ body: " \n\t " }));
  assert.deepEqual(calls, []);

  await pmbTool.invoke({ body: "  One concise nudge. \n" });
  assert.deepEqual(calls, [
    [
      "user_1",
      "One concise nudge.",
      {
        windowId: "window_1",
        evidenceVersion: "v4",
        evidenceCursorStart: 4,
        evidenceCursorEnd: 8,
      },
    ],
  ]);
  assert.doesNotThrow(() => effects.assertSucceeded());
});

test("a swallowed coaching delivery error remains a failed turn effect", async () => {
  const effects = createTurnEffectGuard();
  const pmbTool = createCoachingPostMessageBackTool({
    userId: "user_1",
    windowId: "window_1",
    evidenceVersion: "v4",
    evidenceCursorStart: 4,
    evidenceCursorEnd: 8,
    postMessageBack: async () => {
      throw new Error("matching Desktop did not accept delivery");
    },
    effects,
  });

  await assert.rejects(pmbTool.invoke({ body: "time to move" }), /did not accept delivery/);
  assert.throws(() => effects.assertSucceeded(), /did not accept delivery/);
});

test("ordinary post_message_back remains unbound and exposes only body", async () => {
  const calls = [];
  const pmbTool = createPostMessageBackTool({
    userId: "user_1",
    postMessageBack: async (...args) => {
      calls.push(args);
      return { messageId: "ordinary_1" };
    },
  });

  await pmbTool.invoke({ body: "ordinary proactive note" });

  assert.deepEqual(calls, [["user_1", "ordinary proactive note"]]);
  assert.deepEqual(Object.keys(pmbTool.schema.shape), ["body"]);
});

const alwaysActiveConnections = {
  hasActiveCoachingWindow: () => true,
};
