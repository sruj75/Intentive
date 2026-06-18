import assert from "node:assert/strict";
import test from "node:test";

import { createControlPlaneAccountStateSource } from "../dist/providers/account-state/control-plane-account-state-source.js";

const jsonResponse = (body, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  json: async () => body,
});

test("no session returns null and makes no request", async () => {
  let called = false;
  const source = createControlPlaneAccountStateSource({
    baseUrl: "https://cp.test",
    getUserJwt: async () => null,
    fetch: async () => {
      called = true;
      return jsonResponse({});
    },
  });

  assert.equal(await source.read(), null);
  assert.equal(called, false);
});

test("valid /me response is parsed as AccountState", async () => {
  const source = createControlPlaneAccountStateSource({
    baseUrl: "https://cp.test",
    getUserJwt: async () => "jwt-123",
    fetch: async () =>
      jsonResponse({
        user_id: "u_1",
        next_gate: null,
        has_agent_instance: false,
        has_desktop_client: false,
      }),
  });

  assert.deepEqual(await source.read(), {
    user_id: "u_1",
    next_gate: null,
    has_agent_instance: false,
    has_desktop_client: false,
  });
});

test("valid /me response preserves registered Desktop Client state", async () => {
  const source = createControlPlaneAccountStateSource({
    baseUrl: "https://cp.test",
    getUserJwt: async () => "jwt-123",
    fetch: async () =>
      jsonResponse({
        user_id: "u_1",
        next_gate: null,
        has_agent_instance: false,
        has_desktop_client: true,
      }),
  });

  assert.equal((await source.read())?.has_desktop_client, true);
});

test("the bearer token is presented to ${base}/me", async () => {
  let seen;
  const source = createControlPlaneAccountStateSource({
    baseUrl: "https://cp.test",
    getUserJwt: async () => "jwt-abc",
    fetch: async (url, init) => {
      seen = { url, authorization: init?.headers?.authorization };
      return jsonResponse({
        user_id: "u_1",
        next_gate: null,
        has_agent_instance: false,
        has_desktop_client: false,
      });
    },
  });

  await source.read();
  assert.equal(seen.url, "https://cp.test/me");
  assert.equal(seen.authorization, "Bearer jwt-abc");
});

test("blank Control Plane base URL rejects a signed-in read", async () => {
  const source = createControlPlaneAccountStateSource({
    baseUrl: "",
    getUserJwt: async () => "jwt-123",
    fetch: async () => jsonResponse({}),
  });

  await assert.rejects(() => source.read(), /not configured/);
});

test("a malformed /me body is rejected at the boundary", async () => {
  const source = createControlPlaneAccountStateSource({
    baseUrl: "https://cp.test",
    getUserJwt: async () => "jwt-123",
    fetch: async () => jsonResponse({ user_id: "u_1" }),
  });

  await assert.rejects(() => source.read());
});
