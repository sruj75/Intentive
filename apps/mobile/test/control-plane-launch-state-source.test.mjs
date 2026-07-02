/**
 * The real LaunchStateSource, hermetic: injected fake `getUserJwt` and `fetch`
 * stand in for the auth SDK and the network. Proves the three branches — signed
 * out, signed-in success (mapped), and request failure (throws so the store
 * falls back) — plus that it presents the Bearer token to `${base}/me`.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createControlPlaneLaunchStateSource } from "../dist/providers/launch-state/control-plane-source.js";

const jsonResponse = (body, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  json: async () => body,
});

test("no session → signed-out projection, and no request is made", async () => {
  let called = false;
  const source = createControlPlaneLaunchStateSource({
    baseUrl: "https://cp.test",
    getUserJwt: async () => null,
    fetch: async () => {
      called = true;
      return jsonResponse({});
    },
  });

  const state = await source.read();
  assert.deepEqual(state, {
    signedIn: false,
    consent: "pending",
    onboarding: "pending",
    siblingInvitation: "pending",
    trial: "pending",
  });
  assert.equal(called, false, "must not call the Control Plane without a session");
});

test("a valid /me response is parsed and mapped to LaunchState", async () => {
  const source = createControlPlaneLaunchStateSource({
    baseUrl: "https://cp.test",
    getUserJwt: async () => "jwt-123",
    fetch: async () =>
      jsonResponse({
        user_id: "u_1",
        next_gate: "consent_primer",
        has_agent_instance: false,
        has_desktop_client: false,
      }),
  });

  const state = await source.read();
  assert.deepEqual(state, {
    signedIn: true,
    consent: "pending",
    onboarding: "completed",
    siblingInvitation: "pending",
    trial: "completed",
  });
});

test("the bearer token is presented to ${base}/me", async () => {
  let seen;
  const source = createControlPlaneLaunchStateSource({
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

test("a non-2xx response throws so the store applies its signed-out fallback", async () => {
  const source = createControlPlaneLaunchStateSource({
    baseUrl: "https://cp.test",
    getUserJwt: async () => "jwt-123",
    fetch: async () => jsonResponse({ error: "nope" }, { ok: false, status: 503 }),
  });

  await assert.rejects(() => source.read(), /503/);
});

test("a malformed /me body is rejected at the boundary", async () => {
  const source = createControlPlaneLaunchStateSource({
    baseUrl: "https://cp.test",
    getUserJwt: async () => "jwt-123",
    fetch: async () => jsonResponse({ user_id: "u_1" }), // missing required fields
  });

  await assert.rejects(() => source.read());
});
