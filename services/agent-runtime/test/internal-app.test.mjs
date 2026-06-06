import assert from "node:assert/strict";
import test from "node:test";

import { createInternalApp } from "../dist/index.js";

function jsonPost(body, secret = "runtime-inbound-secret") {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  };
}

test("POST /internal/sessions/start returns the Session Start response with the internal secret", async () => {
  const app = createInternalApp({
    secret: "runtime-inbound-secret",
    startSession: async (request) => ({
      agent_instance_id: `agent_instance_for_${request.user_id}`,
      ws_url: "wss://runtime.example.com/ws",
    }),
  });

  const res = await app.request("/internal/sessions/start", jsonPost({ user_id: "user_1" }));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    agent_instance_id: "agent_instance_for_user_1",
    ws_url: "wss://runtime.example.com/ws",
  });
});

test("POST /internal/sessions/start rejects a missing, malformed, or wrong internal secret before side effects", async () => {
  let calls = 0;
  const app = createInternalApp({
    secret: "runtime-inbound-secret",
    startSession: async () => {
      calls += 1;
      return { agent_instance_id: "agent_instance_1", ws_url: "wss://runtime.example.com/ws" };
    },
  });

  const missing = await app.request("/internal/sessions/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ user_id: "user_1" }),
  });
  const wrong = await app.request(
    "/internal/sessions/start",
    jsonPost({ user_id: "user_1" }, "wrong-secret"),
  );
  const malformed = await app.request("/internal/sessions/start", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Token runtime-inbound-secret" },
    body: JSON.stringify({ user_id: "user_1" }),
  });

  assert.equal(missing.status, 401);
  assert.equal(wrong.status, 401);
  assert.equal(malformed.status, 401);
  assert.equal(calls, 0);
});

test("POST /internal/sessions/start rejects malformed bodies before side effects", async () => {
  let calls = 0;
  const app = createInternalApp({
    secret: "runtime-inbound-secret",
    startSession: async () => {
      calls += 1;
      return { agent_instance_id: "agent_instance_1", ws_url: "wss://runtime.example.com/ws" };
    },
  });

  const res = await app.request("/internal/sessions/start", jsonPost({}));

  assert.equal(res.status, 400);
  assert.equal(calls, 0);
});

test("GET /healthz is a 200 liveness probe", async () => {
  const app = createInternalApp({
    secret: "runtime-inbound-secret",
    startSession: async () => ({
      agent_instance_id: "agent_instance_1",
      ws_url: "wss://runtime.example.com/ws",
    }),
  });

  const res = await app.request("/healthz");

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, service: "agent-runtime" });
});
