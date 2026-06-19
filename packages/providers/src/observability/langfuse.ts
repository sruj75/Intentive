import { CallbackHandler } from "langfuse-langchain";

import type {
  CallbackHandlerFactory,
  FlushableCallbackHandler,
  LangfuseTracingConfig,
} from "./types.js";

export interface LangfuseCallbackHandlers {
  readonly createCallbackHandler: CallbackHandlerFactory;
  readonly shutdown: () => Promise<void>;
}

export interface LangfuseCallbackHandlerDeps {
  readonly createHandler?: (config: LangfuseTracingConfig) => FlushableCallbackHandler;
}

export function createLangfuseCallbackHandlerFactory(
  config: LangfuseTracingConfig | null,
  deps: LangfuseCallbackHandlerDeps = {},
): LangfuseCallbackHandlers {
  if (!config) {
    return {
      createCallbackHandler: () => null,
      shutdown: async () => {},
    };
  }
  if (config.mode === "otel") {
    throw new Error("Langfuse otel mode is not wired in v1.");
  }

  const activeHandlers = new Set<FlushableCallbackHandler>();
  const createHandler =
    deps.createHandler ??
    ((input) =>
      new CallbackHandler({
        publicKey: input.publicKey,
        secretKey: input.secretKey,
        baseUrl: input.baseUrl,
      }));

  return {
    createCallbackHandler() {
      const handler = trackHandler(createHandler(config), activeHandlers);
      activeHandlers.add(handler);
      return handler;
    },
    async shutdown() {
      const handlers = [...activeHandlers];
      activeHandlers.clear();
      await Promise.allSettled(handlers.map(shutdownHandler));
    },
  };
}

function trackHandler(
  handler: FlushableCallbackHandler,
  activeHandlers: Set<FlushableCallbackHandler>,
): FlushableCallbackHandler {
  const flushAsync = handler.flushAsync?.bind(handler);
  if (flushAsync) {
    handler.flushAsync = async () => {
      try {
        return await flushAsync();
      } finally {
        activeHandlers.delete(handler);
      }
    };
  }

  const shutdownAsync = handler.shutdownAsync?.bind(handler);
  if (shutdownAsync) {
    handler.shutdownAsync = async () => {
      try {
        return await shutdownAsync();
      } finally {
        activeHandlers.delete(handler);
      }
    };
  }

  return handler;
}

async function shutdownHandler(handler: FlushableCallbackHandler): Promise<void> {
  if (handler.shutdownAsync) {
    await handler.shutdownAsync();
    return;
  }
  await handler.flushAsync?.();
}
