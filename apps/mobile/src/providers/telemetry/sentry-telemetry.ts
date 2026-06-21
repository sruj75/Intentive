import * as Sentry from "@sentry/react-native";
import type { ComponentType } from "react";

import { noopTelemetry, type Telemetry, type TelemetryBreadcrumb } from "./types.js";

export interface TelemetryConfig {
  readonly dsn?: string;
  readonly environment?: string;
}

let sentryReady = false;
let sentryTelemetry: Telemetry | null = null;

export function initTelemetry(config: TelemetryConfig): void {
  const dsn = config.dsn?.trim();
  if (!dsn) {
    sentryReady = false;
    sentryTelemetry = null;
    return;
  }

  if (sentryReady) return;

  Sentry.init({
    dsn,
    environment: config.environment,
    enableAutoSessionTracking: false,
  });
  sentryReady = true;
}

export function wrapRoot<C extends ComponentType<Record<string, never>>>(Component: C): C {
  if (!sentryReady) return Component;
  return Sentry.wrap(Component) as C;
}

export function createSentryTelemetry(): Telemetry {
  if (!sentryReady) return noopTelemetry;
  if (sentryTelemetry) return sentryTelemetry;

  sentryTelemetry = {
    captureException(error, ctx) {
      Sentry.withScope((scope) => {
        for (const [key, value] of Object.entries(ctx?.tags ?? {})) {
          scope.setTag(key, value);
        }
        Sentry.captureException(error);
      });
    },
    addBreadcrumb(crumb) {
      Sentry.addBreadcrumb(toSentryBreadcrumb(crumb));
    },
  };
  return sentryTelemetry;
}

function toSentryBreadcrumb(
  crumb: TelemetryBreadcrumb,
): Parameters<typeof Sentry.addBreadcrumb>[0] {
  return {
    message: crumb.message,
    level: crumb.level,
    data: crumb.data,
  };
}
