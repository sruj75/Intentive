import assert from "node:assert/strict";
import test from "node:test";

import { createConnectHandler } from "../dist/index.js";

const validConnect = {
  type: "connect",
  auth_token: "jwt_1",
  client_kind: "mobile",
  client_version: "1.0.0",
};

test("connect handshake verifies the JWT and returns hello_ok with an empty Session Snapshot", async () => {
  let seenToken;
  const handler = createConnectHandler({
    verifier: {
      verify: async (token) => {
        seenToken = token;
        return { user_id: "user_1" };
      },
    },
  });

  const result = await handler.handle(validConnect);

  assert.equal(seenToken, "jwt_1");
  assert.equal(result.closeSocket, false);
  assert.deepEqual(result.response, {
    type: "hello_ok",
    session_snapshot: { messages: [], before_cursor: null },
  });
});

test("connect handshake maps JWT verification failures to structured runtime errors", async () => {
  for (const [reason, code] of [
    ["invalid_signature", "auth_failed"],
    ["expired", "auth_failed"],
    ["jwks_unavailable", "service_unavailable"],
  ]) {
    const handler = createConnectHandler({
      verifier: { verify: async () => Promise.reject({ reason }) },
    });

    const result = await handler.handle(validConnect);

    assert.equal(result.closeSocket, true);
    assert.equal(result.response.type, "runtime_error");
    assert.equal(result.response.code, code);
  }
});

test("pre-handshake non-connect events are rejected before JWT verification", async () => {
  let verifierCalls = 0;
  const handler = createConnectHandler({
    verifier: {
      verify: async () => {
        verifierCalls += 1;
        return { user_id: "user_1" };
      },
    },
  });

  const result = await handler.handle({
    type: "user_message",
    message_id: "message_1",
    body: "hello",
    sent_at: "2026-06-06T00:00:00.000Z",
  });

  assert.equal(result.closeSocket, true);
  assert.deepEqual(result.response, {
    type: "runtime_error",
    code: "invalid_connect",
    message: "First WebSocket event must be connect.",
  });
  assert.equal(verifierCalls, 0);
});

test("malformed inbound events are rejected as invalid_connect", async () => {
  let verifierCalls = 0;
  const handler = createConnectHandler({
    verifier: {
      verify: async () => {
        verifierCalls += 1;
        return { user_id: "user_1" };
      },
    },
  });

  const result = await handler.handle({ type: "connect", client_kind: "mobile" });

  assert.equal(result.closeSocket, true);
  assert.equal(result.response.type, "runtime_error");
  assert.equal(result.response.code, "invalid_connect");
  assert.equal(verifierCalls, 0);
});
