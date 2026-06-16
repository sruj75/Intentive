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
      },
    },
  );

  assert.equal(initCalls.length, 1);
  assert.equal(initCalls[0].skipOpenTelemetrySetup, true);
  assert.equal(initCalls[0].dsn, "https://public@example.ingest.sentry.io/1");
  assert.equal(initCalls[0].environment, "staging");
  assert.equal(initCalls[0].release, "agent-runtime@sha");
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
