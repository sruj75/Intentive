import { describe, expect, it } from "vitest";
import type { Breadcrumb, ErrorEvent } from "@sentry/react";
import {
  beforeBreadcrumb,
  beforeSend,
  CaptureRateLimiter,
  initObservability,
} from "../providers/observability";

describe("desktop observability scrubbers", () => {
  it("strips URL query strings and request secrets before sending events", () => {
    const event = beforeSend(
      {
        type: undefined,
        request: {
          url: "https://control-plane.example/agent?token=secret&jwt=abc",
          headers: {
            authorization: "Bearer secret",
            "x-safe": "ok",
          },
          cookies: { session: "secret" },
          data: { snapshot_summary: "private screen text" },
          query_string: "token=secret",
        },
      } satisfies ErrorEvent,
      {},
    );

    expect(event?.request?.url).toBe("https://control-plane.example/agent");
    expect(event?.request?.headers).toEqual({
      authorization: "[Filtered]",
      "x-safe": "ok",
    });
    expect(event?.request?.cookies).toBeUndefined();
    expect(event?.request?.data).toBeUndefined();
    expect(event?.request?.query_string).toBeUndefined();
  });

  it("redacts token-shaped strings and snapshot payload keys from breadcrumbs", () => {
    const breadcrumb = beforeBreadcrumb({
      message: "failed token=secret eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature",
      data: {
        state: "routing_ready",
        snapshot: "private screen text",
      },
    } satisfies Breadcrumb);

    expect(breadcrumb?.message).toBe("failed token=[Filtered] [Filtered]");
    expect(breadcrumb?.data).toEqual({
      state: "routing_ready",
      snapshot: "[Filtered]",
    });
  });

  it("does not redact benign substrings inside free-form message keys", () => {
    const breadcrumb = beforeBreadcrumb({
      message: "monkey=see myauth=token keyboard=click token=secret authorization=Bearer",
    } satisfies Breadcrumb);

    expect(breadcrumb?.message).toBe(
      "monkey=see myauth=token keyboard=click token=[Filtered] authorization=[Filtered]",
    );
  });

  it("keeps Sentry default global handlers installed", () => {
    let initOptions: unknown;

    initObservability(
      {
        BASE_URL: "/",
        DEV: false,
        MODE: "test",
        PROD: false,
        SSR: false,
        VITE_SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
      } as ImportMetaEnv,
      {
        init: (options) => {
          initOptions = options;
          return undefined;
        },
      },
    );

    expect(initOptions).toMatchObject({
      dsn: "https://public@example.ingest.sentry.io/1",
      tracesSampleRate: 0,
      sendDefaultPii: false,
    });
    const integrations = (
      initOptions as { integrations?: (defaults: { name: string }[]) => unknown }
    ).integrations;
    expect(integrations).toBeTypeOf("function");
    expect(integrations?.([{ name: "GlobalHandlers" }, { name: "BrowserSession" }])).toEqual([
      { name: "GlobalHandlers" },
    ]);
  });

  it("rate-limits captures by failure class", () => {
    const limiter = new CaptureRateLimiter<string>(1_000);

    expect(limiter.shouldCapture("auth", 1_000)).toBe(true);
    expect(limiter.shouldCapture("auth", 1_500)).toBe(false);
    expect(limiter.shouldCapture("routing", 1_500)).toBe(true);
    expect(limiter.shouldCapture("auth", 2_000)).toBe(true);
  });
});
