import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryAgentInstanceRegistry, createStartSession } from "../dist/index.js";

test("startSession returns an Agent Instance id and the configured WebSocket URL", async () => {
  const registry = createInMemoryAgentInstanceRegistry({ newId: () => "agent_instance_1" });
  const startSession = createStartSession({
    registry,
    wsUrl: "wss://runtime.example.com/ws",
  });

  assert.deepEqual(await startSession({ auth_subject: "sub_1", user_id: "user_1" }), {
    agent_instance_id: "agent_instance_1",
    ws_url: "wss://runtime.example.com/ws",
  });
});

test("startSession is idempotent per User and distinct across Users", async () => {
  let next = 0;
  const registry = createInMemoryAgentInstanceRegistry({
    newId: () => `agent_instance_${++next}`,
  });
  const startSession = createStartSession({
    registry,
    wsUrl: "wss://runtime.example.com/ws",
  });

  const first = await startSession({ auth_subject: "sub_1", user_id: "user_1" });
  const again = await startSession({ auth_subject: "sub_1", user_id: "user_1" });
  const other = await startSession({ auth_subject: "sub_2", user_id: "user_2" });

  assert.equal(first.agent_instance_id, "agent_instance_1");
  assert.equal(again.agent_instance_id, first.agent_instance_id);
  assert.equal(other.agent_instance_id, "agent_instance_2");
});
