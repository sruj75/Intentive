import assert from "node:assert/strict";
import test from "node:test";

import { bootstrapObservability } from "../dist/observability/index.js";

test("bootstrap initializes Sentry errors-only with OpenTelemetry skipped", () => {
  const initCalls = [];
  const observability = bootstrapObservability(
    {
      sentry: {
        dsn: "https://public@example.ingest.sentry.io/1",
        environment: "staging",
        release: "agent-runtime@sha",
        mode: "errors-only",
      },
      langfuse: null,
    },
    {
      sentry: {
        init: (options) => initCalls.push(options),
        captureException: () => {},
        addBreadcrumb: () => {},
        close: async () => true,
      },
    },
  );

  assert.equal(initCalls.length, 1);
  assert.equal(initCalls[0].skipOpenTelemetrySetup, true);
  assert.equal(initCalls[0].dsn, "https://public@example.ingest.sentry.io/1");
  assert.equal(initCalls[0].environment, "staging");
  assert.equal(initCalls[0].release, "agent-runtime@sha");
  assert.equal(initCalls[0].sendDefaultPii, false);
  const scrubbed = initCalls[0].beforeSend({
    message: "private model response",
    request: { data: "private request body", headers: { authorization: "secret" } },
    extra: { prompt: "private prompt" },
    contexts: { model: { response: "private output" } },
    user: { email: "founder@example.com" },
    breadcrumbs: [
      { category: "http", message: "private URL", data: { body: "private" } },
      {
        category: "agent-runtime",
        level: "info",
        message: "coaching.monitoring_turn",
        data: { status: "ok", body: "drop me" },
      },
    ],
    exception: {
      values: [
        {
          type: "ProviderError",
          value: "private provider response",
          stacktrace: {
            frames: [
              {
                filename: "runtime.js",
                function: "run",
                lineno: 10,
                vars: { body: "private" },
              },
            ],
          },
        },
      ],
    },
  });
  assert.equal(scrubbed.message, undefined);
  assert.equal(scrubbed.request, undefined);
  assert.equal(scrubbed.extra, undefined);
  assert.equal(scrubbed.contexts, undefined);
  assert.equal(scrubbed.user, undefined);
  assert.deepEqual(scrubbed.breadcrumbs, [
    {
      category: "agent-runtime",
      level: "info",
      message: "coaching.monitoring_turn",
      data: { status: "ok" },
    },
  ]);
  assert.equal(scrubbed.exception.values[0].value, "Content-redacted application error");
  assert.equal(scrubbed.exception.values[0].stacktrace.frames[0].vars, undefined);
  assert.equal(observability.createCallbackHandler(), null);
});

test("bootstrap rejects reserved observability modes in v1", () => {
  assert.throws(
    () =>
      bootstrapObservability(
        {
          sentry: {
            dsn: "https://public@example.ingest.sentry.io/1",
            mode: "errors-and-performance",
          },
          langfuse: null,
        },
        {
          sentry: {
            init: () => {},
            captureException: () => {},
            addBreadcrumb: () => {},
            close: async () => true,
          },
        },
      ),
    /not wired in v1/,
  );

  assert.throws(
    () =>
      bootstrapObservability({
        sentry: null,
        langfuse: {
          publicKey: "pk",
          secretKey: "sk",
          mode: "otel",
        },
      }),
    /not wired in v1/,
  );
});

test("shutdown closes Sentry and all created Langfuse callback handlers", async () => {
  const sentryCloseCalls = [];
  const handlerCalls = [];
  const observability = bootstrapObservability(
    {
      sentry: {
        dsn: "https://public@example.ingest.sentry.io/1",
        mode: "errors-only",
      },
      langfuse: {
        publicKey: "pk",
        secretKey: "sk",
        mode: "callback",
      },
    },
    {
      sentry: {
        init: () => {},
        captureException: () => {},
        addBreadcrumb: () => {},
        close: async (timeoutMs) => {
          sentryCloseCalls.push(timeoutMs);
          return true;
        },
      },
      langfuse: {
        createHandler: () => ({
          name: "fake-langfuse",
          async shutdownAsync() {
            handlerCalls.push("shutdown");
          },
        }),
      },
    },
  );

  observability.createCallbackHandler();
  observability.createCallbackHandler();
  await observability.shutdown();

  assert.deepEqual(sentryCloseCalls, [2_000]);
  assert.deepEqual(handlerCalls, ["shutdown", "shutdown"]);
});

test("shutdown resolves when observability is unconfigured or a drain rejects", async () => {
  await bootstrapObservability({ sentry: null, langfuse: null }).shutdown();

  const observability = bootstrapObservability(
    {
      sentry: {
        dsn: "https://public@example.ingest.sentry.io/1",
        mode: "errors-only",
      },
      langfuse: {
        publicKey: "pk",
        secretKey: "sk",
        mode: "callback",
      },
    },
    {
      sentry: {
        init: () => {},
        captureException: () => {},
        addBreadcrumb: () => {},
        close: async () => {
          throw new Error("sentry unavailable");
        },
      },
      langfuse: {
        createHandler: () => ({
          name: "fake-langfuse",
          async flushAsync() {
            throw new Error("langfuse unavailable");
          },
        }),
      },
    },
  );

  observability.createCallbackHandler();
  await observability.shutdown();
});

test("shutdown drains additional observability-owned hooks", async () => {
  const drains = [];
  const observability = bootstrapObservability(
    { sentry: null, langfuse: null },
    {
      shutdown: [async () => drains.push("prompt-client"), () => drains.push("sync-hook")],
    },
  );

  await observability.shutdown();

  assert.deepEqual(drains, ["prompt-client", "sync-hook"]);
});
