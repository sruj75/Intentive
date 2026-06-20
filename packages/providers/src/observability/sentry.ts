import type { Breadcrumb, NodeOptions } from "@sentry/node";
import * as Sentry from "@sentry/node";

import type { LogAttrs, SentrySink } from "../telemetry.js";
import type { SentryConfig } from "./types.js";

export interface SentryModule {
  init(options: NodeOptions): void;
  captureException(error: unknown, context?: { tags?: Record<string, string> }): void;
  addBreadcrumb(crumb: Breadcrumb): void;
  close(timeout?: number): Promise<boolean> | boolean;
}

export interface SentrySinkWithShutdown extends SentrySink {
  shutdown(timeoutMs?: number): Promise<void>;
}

export function createSentrySink(
  config: SentryConfig | null,
  sentry: SentryModule = Sentry,
): SentrySinkWithShutdown {
  if (!config) {
    return noopSentrySink;
  }
  if (config.mode === "errors-and-performance") {
    throw new Error("Sentry errors-and-performance mode is not wired in v1.");
  }

  sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    skipOpenTelemetrySetup: true,
  });

  return {
    captureException(error, context) {
      sentry.captureException(error, { tags: stringifyTags(context?.tags) });
    },
    addBreadcrumb(crumb) {
      sentry.addBreadcrumb({
        category: "agent-runtime",
        level: crumb.level,
        message: crumb.message,
        data: crumb.data,
      });
    },
    async shutdown(timeoutMs = 2_000) {
      await sentry.close(timeoutMs);
    },
  };
}

export const noopSentrySink: SentrySinkWithShutdown = {
  captureException: () => {},
  addBreadcrumb: () => {},
  shutdown: async () => {},
};

function stringifyTags(attrs: LogAttrs | undefined): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value !== null && value !== undefined) {
      tags[key] = String(value);
    }
  }
  return tags;
}
