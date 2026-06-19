import type { BaseCallbackHandler } from "@langchain/core/callbacks/base";

import type { Logger, SentrySink } from "../telemetry.js";

export type SentryMode = "errors-only" | "errors-and-performance";
export type LangfuseMode = "callback" | "otel";

export interface SentryConfig {
  readonly dsn: string;
  readonly environment?: string;
  readonly release?: string;
  readonly mode: SentryMode;
}

export interface LangfuseTracingConfig {
  readonly publicKey: string;
  readonly secretKey: string;
  readonly baseUrl?: string;
  readonly mode: LangfuseMode;
}

export interface ObservabilityConfig {
  readonly sentry: SentryConfig | null;
  readonly langfuse: LangfuseTracingConfig | null;
}

export interface FlushableCallbackHandler extends BaseCallbackHandler {
  flushAsync?: () => Promise<unknown>;
  shutdownAsync?: () => Promise<unknown>;
}

export type CallbackHandlerFactory = () => FlushableCallbackHandler | null;

export interface Observability {
  readonly createCallbackHandler: CallbackHandlerFactory;
  readonly captureException: SentrySink["captureException"];
  readonly addBreadcrumb: SentrySink["addBreadcrumb"];
  readonly createLogger: (name: string) => Logger;
  readonly shutdown: () => Promise<void>;
}
