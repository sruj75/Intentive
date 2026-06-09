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

/** All three handlers stubbed, so any single route can be exercised in isolation. */
const appWith = (overrides) =>
  createApp({
    getMe: { handle: async () => ({ status: 200, body: {} }) },
    postConsent: { handle: async () => ({ status: 200, body: {} }) },
    postSiblingInvitationSkip: { handle: async () => ({ status: 200, body: {} }) },
    ...overrides,
  });

test("GET /me returns the handler's status and body", async () => {
  const app = appWith({
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
