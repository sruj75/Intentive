import assert from "node:assert/strict";
import test from "node:test";

import { createPostMessageBack, createPostMessageBackTool } from "../dist/index.js";

test("postMessageBack persists a companion PMB row before proactive delivery", async () => {
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
      deliver: async (message, mode) => {
        order.push("deliver");
        deliveries.push([message, mode]);
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
    [{ userId: "user_1", messageId: "pmb_1", body: "go drink water" }, "proactive"],
  ]);
});

test("post_message_back tool binds the user id and exposes only body", async () => {
  const calls = [];
  const postMessageBack = async (userId, body) => {
    calls.push([userId, body]);
    return { messageId: "pmb_1" };
  };
  const pmbTool = createPostMessageBackTool({ userId: "user_1", postMessageBack });

  const result = await pmbTool.invoke({ body: "time to move" });

  assert.equal(pmbTool.name, "post_message_back");
  assert.deepEqual(calls, [["user_1", "time to move"]]);
  assert.match(result, /pmb_1/);
});
