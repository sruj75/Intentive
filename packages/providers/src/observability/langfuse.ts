import { CallbackHandler } from "langfuse-langchain";

import type { CallbackHandlerFactory, LangfuseTracingConfig } from "./types.js";

export function createLangfuseCallbackHandlerFactory(
  config: LangfuseTracingConfig | null,
): CallbackHandlerFactory {
  if (!config) {
    return () => null;
  }
  if (config.mode === "otel") {
    throw new Error("Langfuse otel mode is not wired in v1.");
  }

  return () =>
    new CallbackHandler({
      publicKey: config.publicKey,
      secretKey: config.secretKey,
      baseUrl: config.baseUrl,
    });
}
