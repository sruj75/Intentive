import { createLogger as createTelemetryLogger } from "../telemetry.js";
import { createLangfuseCallbackHandlerFactory } from "./langfuse.js";
import { createSentrySink, type SentryModule } from "./sentry.js";
import type { Observability, ObservabilityConfig } from "./types.js";

/**
 * Owns observability init order:
 * 1. Sentry first, with skipOpenTelemetrySetup so it never claims globals.
 * 2. Future performance OTel only inside this module.
 * 3. Langfuse callback tracing stays isolated from Sentry error capture.
 *
 * Never enable Sentry gen_ai/AI-agent auto-instrumentation, Sentry LangChain
 * integration, Langfuse export-all filters, or second SDK init calls in domains.
 */
export function bootstrapObservability(
  config: ObservabilityConfig,
  deps: { readonly sentry?: SentryModule } = {},
): Observability {
  const sentrySink = createSentrySink(config.sentry, deps.sentry);
  const createCallbackHandler = createLangfuseCallbackHandlerFactory(config.langfuse);

  return {
    createCallbackHandler,
    captureException: sentrySink.captureException,
    addBreadcrumb: sentrySink.addBreadcrumb,
    createLogger(name) {
      return createTelemetryLogger(name, { sentry: sentrySink });
    },
  };
}
