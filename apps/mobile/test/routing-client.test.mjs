import assert from "node:assert/strict";
import test from "node:test";

import { getRuntimeRouting } from "../dist/domains/chat/service/routing-client.js";

test("200 returns normalized Runtime routing", async () => {
  const result = await getRuntimeRouting({
    baseUrl: "https://control.example",
    getUserJwt: async () => "user-jwt",
    fetch: async (url, init) => {
      assert.equal(url, "https://control.example/agent");
      assert.equal(init.headers.authorization, "Bearer user-jwt");
      return response(200, {
        agent_instance_id: "agent-1",
        ws_url: "wss://runtime.example/session",
        runtime_jwt: "runtime-jwt",
      });
    },
  });

  assert.deepEqual(result, {
    status: "ok",
    routing: {
      agentInstanceId: "agent-1",
      wsUrl: "wss://runtime.example/session",
      runtimeJwt: "runtime-jwt",
    },
  });
});

test("routing status codes map to retry, re-auth, and gate actions", async () => {
  assert.equal((await routeWithStatus(503)).status, "retry");
  assert.equal((await routeWithStatus(401)).status, "reauth");
  assert.equal((await routeWithStatus(403)).status, "gate");
});

test("missing User JWT maps to re-auth without a network call", async () => {
  let calls = 0;
  const result = await getRuntimeRouting({
    baseUrl: "https://control.example",
    getUserJwt: async () => null,
    fetch: async () => {
      calls += 1;
      return response(200, {});
    },
  });

  assert.equal(result.status, "reauth");
  assert.equal(calls, 0);
});

async function routeWithStatus(status) {
  return getRuntimeRouting({
    baseUrl: "https://control.example",
    getUserJwt: async () => "user-jwt",
    fetch: async () => response(status, {}),
  });
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}
