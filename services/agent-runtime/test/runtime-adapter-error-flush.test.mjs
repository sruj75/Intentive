import assert from "node:assert/strict";
import test from "node:test";

import { createLangfuseCallbackHandlerFactory } from "@intentive/providers/observability";

import { createDeepAgentsAdapter } from "../dist/index.js";
import { normalizeModelInvocationError } from "../dist/domains/runtime/repo/deep-agents-adapter.js";

// Regression for the langfuse per-turn handler leak: the factory only evicts a
// handler from its active set when that handler is flushed or shut down. The
// adapter used to flush only on the success path, so a turn whose `agent.invoke`
// threw left its handler retained in the factory's Set for the process lifetime
// — one leaked handler per failed turn on the always-alive runtime.
//
// This test forces `agent.invoke` to throw (unreachable Postgres, no DB needed)
// and asserts the per-turn handler is still flushed — which is also what evicts
// it from the real factory's active set.
test("DeepAgents adapter flushes the per-turn handler when a turn fails", async () => {
  let created = 0;
  let flushed = 0;
  const factory = createLangfuseCallbackHandlerFactory(
    { publicKey: "pk", secretKey: "sk", mode: "callback" },
    {
      createHandler: () => {
        created += 1;
        return {
          name: "fake-langfuse",
          getTraceId: () => "trace_x",
          async flushAsync() {
            flushed += 1;
          },
        };
      },
    },
  );

  const adapter = createDeepAgentsAdapter({
    // Unreachable Postgres → checkpoint read inside agent.invoke rejects.
    connectionUri: "postgresql://u:p@127.0.0.1:1/db",
    modelName: "test-model",
    systemPrompt: "You are a test.",
    createCallbackHandler: factory.createCallbackHandler,
  });

  await assert.rejects(() =>
    adapter.invoke({
      userId: "u1",
      threadId: "t1",
      trigger: "user_message",
      body: "hi",
      pinnedFloor: { version: "v1", langfusePrompts: [] },
    }),
  );

  assert.equal(created, 1, "a per-turn handler should have been created");
  assert.equal(flushed, 1, "a failed turn must still flush (and thus evict) its handler");
});

test("DeepAgents adapter normalizes LangChain empty-generation crashes", () => {
  const normalized = normalizeModelInvocationError(
    new TypeError("Cannot read properties of undefined (reading 'message')"),
    { modelName: "nvidia/nemotron-3-ultra-550b-a55b:free", trigger: "heartbeat" },
  );

  assert.match(normalized.message, /empty chat generation/);
  assert.match(normalized.message, /nvidia\/nemotron-3-ultra-550b-a55b:free/);
  assert.match(normalized.message, /heartbeat/);
  assert.equal(normalized.cause instanceof TypeError, true);
});
