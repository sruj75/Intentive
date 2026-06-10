/**
 * Session Start client, hermetic: a fake `fetch` stands in for the Agent Runtime
 * HTTP boundary. This tier pins the wire contract — the URL, the Directional
 * Secret on the Authorization header, the request body — and that every failure
 * mode collapses into one typed `AgentRuntimeUnavailableError`.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createRuntimeSessionStarter } from "../dist/domains/agents/repo/runtime-session-start.js";
import { AgentRuntimeUnavailableError } from "../dist/domains/agents/types/runtime-errors.js";

const okResponse = (json) => ({ ok: true, status: 200, json: async () => json });

test("sends Bearer <secret> and the request body, parses the AR identity", async () => {
  const calls = [];
  const starter = createRuntimeSessionStarter({
    baseUrl: "https://runtime.example.com",
    secret: "to-runtime-secret",
    fetch: async (url, init) => {
      calls.push({ url, init });
      return okResponse({
        agent_instance_id: "agent_1",
        ws_url: "wss://runtime.example.com/ws",
      });
    },
  });

  const identity = await starter.startSession({ userId: "u_1", authSubject: "sub-1" });

  assert.deepEqual(identity, { agentInstanceId: "agent_1", wsUrl: "wss://runtime.example.com/ws" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://runtime.example.com/internal/sessions/start");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.authorization, "Bearer to-runtime-secret");
  assert.deepEqual(JSON.parse(calls[0].init.body), { user_id: "u_1", auth_subject: "sub-1" });
});

test("a non-2xx response → AgentRuntimeUnavailableError (non_2xx)", async () => {
  const starter = createRuntimeSessionStarter({
    baseUrl: "https://runtime.example.com",
    secret: "s",
    fetch: async () => ({ ok: false, status: 502, json: async () => ({}) }),
  });

  await assert.rejects(
    () => starter.startSession({ userId: "u_1", authSubject: "sub-1" }),
    (err) => {
      assert.ok(err instanceof AgentRuntimeUnavailableError);
      assert.equal(err.reason, "non_2xx");
      return true;
    },
  );
});

test("a transport failure → AgentRuntimeUnavailableError (transport), no secret leak", async () => {
  const starter = createRuntimeSessionStarter({
    baseUrl: "https://runtime.example.com",
    secret: "super-secret",
    fetch: async () => {
      throw new TypeError("fetch failed");
    },
  });

  await assert.rejects(
    () => starter.startSession({ userId: "u_1", authSubject: "sub-1" }),
    (err) => {
      assert.ok(err instanceof AgentRuntimeUnavailableError);
      assert.equal(err.reason, "transport");
      assert.equal(err.message.includes("super-secret"), false);
      return true;
    },
  );
});

test("a 2xx with a malformed body → AgentRuntimeUnavailableError (malformed_response)", async () => {
  const starter = createRuntimeSessionStarter({
    baseUrl: "https://runtime.example.com",
    secret: "s",
    fetch: async () => okResponse({ agent_instance_id: "agent_1" }), // missing ws_url
  });

  await assert.rejects(
    () => starter.startSession({ userId: "u_1", authSubject: "sub-1" }),
    (err) => {
      assert.ok(err instanceof AgentRuntimeUnavailableError);
      assert.equal(err.reason, "malformed_response");
      return true;
    },
  );
});

test("a trailing slash on baseUrl does not double up the path", async () => {
  const calls = [];
  const starter = createRuntimeSessionStarter({
    baseUrl: "https://runtime.example.com/",
    secret: "s",
    fetch: async (url) => {
      calls.push(url);
      return okResponse({ agent_instance_id: "a", ws_url: "wss://r/ws" });
    },
  });

  await starter.startSession({ userId: "u_1", authSubject: "sub-1" });
  assert.equal(calls[0], "https://runtime.example.com/internal/sessions/start");
});
