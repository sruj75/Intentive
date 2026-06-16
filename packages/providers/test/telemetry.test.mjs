import assert from "node:assert/strict";
import test from "node:test";

import { createLogger, errorMessage, redactAttrs } from "../dist/telemetry.js";

test("errorMessage stringifies Errors by message and non-Errors via String()", () => {
  assert.equal(errorMessage(new Error("model unavailable")), "model unavailable");
  assert.equal(errorMessage(new TypeError("bad input")), "bad input");
  assert.equal(errorMessage("plain string"), "plain string");
  assert.equal(errorMessage(42), "42");
  assert.equal(errorMessage(null), "null");
  assert.equal(errorMessage(undefined), "undefined");
});

test("redactAttrs keeps only allowlisted scalar metadata", () => {
  assert.deepEqual(
    redactAttrs({
      user_id: "user_1",
      duration_ms: 12,
      status: "ok",
      body: "must not log",
      token: "secret",
      nested: { value: true },
      model: null,
    }),
    {
      user_id: "user_1",
      duration_ms: 12,
      status: "ok",
      model: null,
    },
  );
});

test("logger writes JSON-shaped records and forwards Sentry signals", () => {
  const records = [];
  const breadcrumbs = [];
  const captures = [];
  const logger = createLogger("agent-runtime", {
    clock: () => new Date("2026-06-16T00:00:00.000Z"),
    sink: (record) => records.push(record),
    sentry: {
      addBreadcrumb: (crumb) => breadcrumbs.push(crumb),
      captureException: (error, context) => captures.push({ error, context }),
    },
  }).child({ user_id: "user_1", body: "dropped" });

  logger.info("gateway.connect", { status: "ok", client_kind: "mobile" });
  const error = new TypeError("boom");
  logger.error("turn.failed", error, { trace_id: "trace_1", token: "dropped" });

  assert.deepEqual(records, [
    {
      time: "2026-06-16T00:00:00.000Z",
      level: "info",
      logger: "agent-runtime",
      event: "gateway.connect",
      user_id: "user_1",
      status: "ok",
      client_kind: "mobile",
    },
    {
      time: "2026-06-16T00:00:00.000Z",
      level: "error",
      logger: "agent-runtime",
      event: "turn.failed",
      user_id: "user_1",
      trace_id: "trace_1",
      error_type: "TypeError",
    },
  ]);
  assert.deepEqual(breadcrumbs, [
    {
      level: "info",
      message: "gateway.connect",
      data: { user_id: "user_1", status: "ok", client_kind: "mobile" },
    },
  ]);
  assert.deepEqual(captures, [
    {
      error,
      context: { tags: { user_id: "user_1", trace_id: "trace_1", error_type: "TypeError" } },
    },
  ]);
});
