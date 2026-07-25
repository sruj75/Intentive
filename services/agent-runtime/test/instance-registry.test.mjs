import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryAgentInstanceRegistry } from "../dist/index.js";

test("in-memory registry fires onNewUser only for a brand-new user, not on reconnect", async () => {
  const newUserEvents = [];
  const registry = createInMemoryAgentInstanceRegistry({
    newId: () => "instance_1",
    onNewUser: (userId) => newUserEvents.push(userId),
  });

  const created = await registry.loadOrCreate({
    userId: "user_1",
    authSubject: "auth_1",
    clientTz: "UTC",
  });
  assert.equal(created.id, "instance_1");
  assert.deepEqual(newUserEvents, ["user_1"]);

  // Reconnecting with the same user_id is an update, not a new user.
  const reconnected = await registry.loadOrCreate({
    userId: "user_1",
    authSubject: "auth_2",
    clientTz: "America/Los_Angeles",
  });
  assert.equal(reconnected.id, "instance_1");
  assert.deepEqual(newUserEvents, ["user_1"]);

  // A different user is genuinely new.
  await registry.loadOrCreate({ userId: "user_2", authSubject: "auth_3" });
  assert.deepEqual(newUserEvents, ["user_1", "user_2"]);
});

test("in-memory registry without onNewUser boots harmlessly", async () => {
  const registry = createInMemoryAgentInstanceRegistry();
  const instance = await registry.loadOrCreate({
    userId: "user_x",
    authSubject: "auth_x",
  });
  assert.equal(instance.userId, "user_x");
  assert.equal(await registry.loadUserTz("user_x"), null);
});
