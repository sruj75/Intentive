import { describe, expect, it } from "vitest";
import type { Breadcrumb, ErrorEvent } from "@sentry/react";
import { beforeBreadcrumb, beforeSend } from "../providers/observability";

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
});
