/**
 * HTTP routing, exercised through Hono's real router via `app.request(...)` —
 * full request/response semantics, no socket. A fake handler stands in for the
 * identity stack so this tier proves wiring (routes, header pass-through,
 * status/body, 404) rather than identity logic.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../dist/domains/identity/ui/app.js";

test("GET /me returns the handler's status and body", async () => {
  const app = createApp({
    getMe: {
      handle: async () => ({
        status: 200,
        body: { user_id: "u_1", next_gate: null, has_agent_instance: false },
      }),
    },
  });

  const res = await app.request("/me");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    user_id: "u_1",
    next_gate: null,
    has_agent_instance: false,
  });
});

test("GET /me forwards the Authorization header to the handler", async () => {
  let seen;
  const app = createApp({
    getMe: {
      handle: async (req) => {
        seen = req.authorization;
        return { status: 200, body: {} };
      },
    },
  });

  await app.request("/me", { headers: { authorization: "Bearer abc.def.ghi" } });
  assert.equal(seen, "Bearer abc.def.ghi");
});

test("GET /me surfaces the handler's error status", async () => {
  const app = createApp({
    getMe: {
      handle: async () => ({ status: 401, body: { code: "auth_failed", message: "x" } }),
    },
  });

  const res = await app.request("/me", { headers: { authorization: "Bearer bad" } });
  assert.equal(res.status, 401);
});

test("GET /healthz is a 200 liveness probe", async () => {
  const app = createApp({ getMe: { handle: async () => ({ status: 200, body: {} }) } });
  const res = await app.request("/healthz");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, service: "control-plane" });
});

test("an unknown route is a 404", async () => {
  const app = createApp({ getMe: { handle: async () => ({ status: 200, body: {} }) } });
  const res = await app.request("/nope");
  assert.equal(res.status, 404);
});
