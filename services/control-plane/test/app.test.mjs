/**
 * HTTP routing, exercised through Hono's real router via `app.request(...)` —
 * full request/response semantics, no socket. A fake handler stands in for the
 * identity stack so this tier proves wiring (routes, header pass-through,
 * status/body, 404) rather than identity logic.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { BoundaryParseError } from "@intentive/api-contract";

import { createApp } from "../dist/domains/identity/ui/app.js";

/** A handler stub that records the request it saw and returns a fixed result. */
const recordingHandler = (sink, result = { status: 200, body: { ok: true } }) => ({
  handle: async (req) => {
    sink.push(req);
    return result;
  },
});

/** All handlers stubbed, so any single route can be exercised in isolation. */
const appWith = (overrides) =>
  createApp({
    getMe: { handle: async () => ({ status: 200, body: {} }) },
    postConsent: { handle: async () => ({ status: 200, body: {} }) },
    postSiblingInvitationSkip: { handle: async () => ({ status: 200, body: {} }) },
    postDeviceRegister: { handle: async () => ({ status: 200, body: {} }) },
    getAgent: { handle: async () => ({ status: 200, body: {} }) },
    postInternalNotificationsPush: { handle: async () => ({ status: 200, body: {} }) },
    postInternalNotificationsCheckReceipts: { handle: async () => ({ status: 200, body: {} }) },
    readiness: { check: async () => ({ ready: true, checks: { neon: "ok", jwks: "ok" } }) },
    ...overrides,
  });

test("GET /me returns the handler's status and body", async () => {
  const app = appWith({
    getMe: {
      handle: async () => ({
        status: 200,
        body: {
          user_id: "u_1",
          next_gate: null,
          has_agent_instance: false,
          has_desktop_client: false,
        },
      }),
    },
  });

  const res = await app.request("/me");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    user_id: "u_1",
    next_gate: null,
    has_agent_instance: false,
    has_desktop_client: false,
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

test("GET /me forwards the device-signal headers to the handler", async () => {
  let seen;
  const app = appWith({
    getMe: {
      handle: async (req) => {
        seen = req;
        return { status: 200, body: {} };
      },
    },
  });

  await app.request("/me", {
    headers: {
      authorization: "Bearer abc.def.ghi",
      "x-client-kind": "desktop",
      "x-capture-permission-granted": "true",
    },
  });
  assert.equal(seen.clientKind, "desktop");
  assert.equal(seen.capturePermissionGranted, "true");
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

test("GET /agent forwards the auth + device-signal headers and returns the handler's result", async () => {
  let seen;
  const app = appWith({
    getAgent: {
      handle: async (req) => {
        seen = req;
        return {
          status: 200,
          body: {
            agent_instance_id: "agent_1",
            ws_url: "wss://runtime.example.com/ws",
            runtime_jwt: "the.user.jwt",
          },
        };
      },
    },
  });

  const res = await app.request("/agent", {
    headers: {
      authorization: "Bearer the.user.jwt",
      "x-client-kind": "mobile",
      "x-capture-permission-granted": "true",
    },
  });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    agent_instance_id: "agent_1",
    ws_url: "wss://runtime.example.com/ws",
    runtime_jwt: "the.user.jwt",
  });
  assert.equal(seen.authorization, "Bearer the.user.jwt");
  assert.equal(seen.clientKind, "mobile");
  assert.equal(seen.capturePermissionGranted, "true");
});

test("GET /agent surfaces the handler's error status", async () => {
  const app = appWith({
    getAgent: {
      handle: async () => ({ status: 403, body: { code: "gate_required", message: "x" } }),
    },
  });

  const res = await app.request("/agent", { headers: { authorization: "Bearer t" } });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { code: "gate_required", message: "x" });
});

test("GET /health is a 200 liveness probe", async () => {
  const app = createApp({ getMe: { handle: async () => ({ status: 200, body: {} }) } });
  const res = await app.request("/health");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, service: "control-plane" });
});

test("GET /healthz remains available as a local compatibility liveness alias", async () => {
  const app = createApp({ getMe: { handle: async () => ({ status: 200, body: {} }) } });
  const res = await app.request("/healthz");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, service: "control-plane" });
});

test("GET /ready is a 200 deep readiness probe when dependencies pass", async () => {
  const app = appWith({
    readiness: {
      check: async () => ({ ready: true, checks: { neon: "ok", jwks: "ok" } }),
    },
  });

  const res = await app.request("/ready");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ready: true, checks: { neon: "ok", jwks: "ok" } });
});

test("GET /readyz remains available as a local compatibility readiness alias", async () => {
  const app = appWith({
    readiness: {
      check: async () => ({ ready: true, checks: { neon: "ok", jwks: "ok" } }),
    },
  });

  const res = await app.request("/readyz");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ready: true, checks: { neon: "ok", jwks: "ok" } });
});

test("GET /ready is a 503 deep readiness probe when a dependency fails", async () => {
  const app = appWith({
    readiness: {
      check: async () => ({ ready: false, checks: { neon: "ok", jwks: "failed" } }),
    },
  });

  const res = await app.request("/ready");
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { ready: false, checks: { neon: "ok", jwks: "failed" } });
});

test("an unknown route is a 404", async () => {
  const app = appWith();
  const res = await app.request("/nope");
  assert.equal(res.status, 404);
});

test("POST /consent routes to the handler with the Authorization header and body", async () => {
  const seen = [];
  const app = appWith({ postConsent: recordingHandler(seen, { status: 200, body: { ok: true } }) });

  const res = await app.request("/consent", {
    method: "POST",
    headers: { authorization: "Bearer abc.def.ghi", "content-type": "application/json" },
    body: JSON.stringify({}),
  });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(seen[0].authorization, "Bearer abc.def.ghi");
  assert.deepEqual(seen[0].body, {});
});

test("POST /consent surfaces the handler's error status", async () => {
  const app = appWith({
    postConsent: { handle: async () => ({ status: 401, body: { code: "auth_failed" } }) },
  });

  const res = await app.request("/consent", { method: "POST" });
  assert.equal(res.status, 401);
});

test("POST /consent rejects malformed JSON before the handler", async () => {
  let called = false;
  const app = appWith({
    postConsent: {
      handle: async () => {
        called = true;
        return { status: 200, body: { ok: true } };
      },
    },
  });

  const res = await app.request("/consent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });

  assert.equal(res.status, 400);
  assert.equal(called, false);
  assert.deepEqual(await res.json(), {
    code: "invalid_request",
    message: "Request body must be valid JSON.",
  });
});

test("POST /consent maps contract parse failures to 400", async () => {
  const app = appWith({
    postConsent: {
      handle: async () => {
        throw new BoundaryParseError(["unexpected"]);
      },
    },
  });

  const res = await app.request("/consent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ unexpected: true }),
  });

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), {
    code: "invalid_request",
    message: "Request body is invalid.",
    invalid_keys: ["unexpected"],
  });
});

test("POST /devices/register routes to the handler with the Authorization header and body", async () => {
  const seen = [];
  const app = appWith({
    postDeviceRegister: recordingHandler(seen, { status: 200, body: { device_id: "dev_1" } }),
  });

  const res = await app.request("/devices/register", {
    method: "POST",
    headers: { authorization: "Bearer abc.def.ghi", "content-type": "application/json" },
    body: JSON.stringify({ device_fingerprint: "fp-1", client_kind: "mobile" }),
  });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { device_id: "dev_1" });
  assert.equal(seen[0].authorization, "Bearer abc.def.ghi");
  assert.deepEqual(seen[0].body, { device_fingerprint: "fp-1", client_kind: "mobile" });
});

test("POST /devices/register rejects malformed JSON before the handler", async () => {
  let called = false;
  const app = appWith({
    postDeviceRegister: {
      handle: async () => {
        called = true;
        return { status: 200, body: { device_id: "dev_1" } };
      },
    },
  });

  const res = await app.request("/devices/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });

  assert.equal(res.status, 400);
  assert.equal(called, false);
  assert.deepEqual(await res.json(), {
    code: "invalid_request",
    message: "Request body must be valid JSON.",
  });
});

test("POST /devices/register maps contract parse failures to 400", async () => {
  const app = appWith({
    postDeviceRegister: {
      handle: async () => {
        throw new BoundaryParseError(["device_fingerprint"]);
      },
    },
  });

  const res = await app.request("/devices/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_kind: "mobile" }),
  });

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), {
    code: "invalid_request",
    message: "Request body is invalid.",
    invalid_keys: ["device_fingerprint"],
  });
});

test("POST /internal/notifications/push routes to the handler with auth and body", async () => {
  const seen = [];
  const app = appWith({
    postInternalNotificationsPush: recordingHandler(seen, {
      status: 200,
      body: { delivered: true, device_count: 1 },
    }),
  });

  const res = await app.request("/internal/notifications/push", {
    method: "POST",
    headers: { authorization: "Bearer runtime-secret", "content-type": "application/json" },
    body: JSON.stringify({ user_id: "u_1", preview_text: "hello", message_id: "m_1" }),
  });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { delivered: true, device_count: 1 });
  assert.equal(seen[0].authorization, "Bearer runtime-secret");
  assert.deepEqual(seen[0].body, { user_id: "u_1", preview_text: "hello", message_id: "m_1" });
});

test("POST /internal/notifications/check-receipts routes to the handler", async () => {
  const seen = [];
  const app = appWith({
    postInternalNotificationsCheckReceipts: recordingHandler(seen, {
      status: 200,
      body: { checked: 2, cleared: 1 },
    }),
  });

  const res = await app.request("/internal/notifications/check-receipts", {
    method: "POST",
    headers: { authorization: "Bearer maintenance-secret", "content-type": "application/json" },
    body: JSON.stringify({ limit: 2 }),
  });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { checked: 2, cleared: 1 });
  assert.equal(seen[0].authorization, "Bearer maintenance-secret");
  assert.deepEqual(seen[0].body, { limit: 2 });
});

test("POST /internal/notifications/check-receipts maps contract parse failures to 400", async () => {
  const app = appWith({
    postInternalNotificationsCheckReceipts: {
      handle: async () => {
        throw new BoundaryParseError(["limit"]);
      },
    },
  });

  const res = await app.request("/internal/notifications/check-receipts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ limit: 0 }),
  });

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), {
    code: "invalid_request",
    message: "Request body is invalid.",
    invalid_keys: ["limit"],
  });
});

test("POST /sibling-invitation/skip routes to the handler with the Authorization header", async () => {
  const seen = [];
  const app = appWith({
    postSiblingInvitationSkip: recordingHandler(seen, { status: 200, body: { ok: true } }),
  });

  const res = await app.request("/sibling-invitation/skip", {
    method: "POST",
    headers: { authorization: "Bearer abc.def.ghi" },
  });

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(seen[0].authorization, "Bearer abc.def.ghi");
});

test("POST /sibling-invitation/skip rejects malformed JSON before the handler", async () => {
  let called = false;
  const app = appWith({
    postSiblingInvitationSkip: {
      handle: async () => {
        called = true;
        return { status: 200, body: { ok: true } };
      },
    },
  });

  const res = await app.request("/sibling-invitation/skip", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });

  assert.equal(res.status, 400);
  assert.equal(called, false);
  assert.deepEqual(await res.json(), {
    code: "invalid_request",
    message: "Request body must be valid JSON.",
  });
});

test("POST /sibling-invitation/skip maps contract parse failures to 400", async () => {
  const app = appWith({
    postSiblingInvitationSkip: {
      handle: async () => {
        throw new BoundaryParseError(["unexpected"]);
      },
    },
  });

  const res = await app.request("/sibling-invitation/skip", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ unexpected: true }),
  });

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), {
    code: "invalid_request",
    message: "Request body is invalid.",
    invalid_keys: ["unexpected"],
  });
});
