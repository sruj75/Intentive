import { AIMessage } from "@langchain/core/messages";
import type { Logger } from "@intentive/providers/telemetry";
import { createNoopLogger } from "@intentive/providers/telemetry";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { StructuredTool } from "@langchain/core/tools";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { ChatOpenAI } from "@langchain/openai";
import { createDeepAgent, type AnyBackendProtocol } from "deepagents";

import type { PinnedProcedureFloor, TurnTrigger } from "../../bundles/types/floor.js";
import type { DeepAgentsAdapter, RuntimeTurnInput, RuntimeTurnOutput } from "../types/turn.js";

const CHECKPOINT_SCHEMA = "agent_runtime";

type PromptAssembler = (input: {
  readonly floor: PinnedProcedureFloor;
  readonly trigger: TurnTrigger;
  readonly userProfile?: string | null;
  readonly recentPerception?: string | null;
  readonly firstRun?: boolean;
}) => string;

type CallbackHandlerLike = BaseCallbackHandler & {
  getTraceId?: () => string | undefined;
  flushAsync?: () => Promise<unknown>;
};

interface DeepAgentsAdapterParams {
  readonly connectionUri: string;
  readonly modelName: string;
  readonly systemPrompt?: string;
  readonly model?: BaseChatModel;
  readonly store?: unknown;
  readonly backend?: AnyBackendProtocol;
  readonly createCallbackHandler?: (() => CallbackHandlerLike | null) | null;
  readonly assemblePrompt?: PromptAssembler;
  readonly createTools?: (input: RuntimeTurnInput) => StructuredTool[];
  readonly openRouter?: {
    readonly apiKey: string;
    readonly baseUrl: string;
  };
  readonly logger?: Logger;
  readonly clock?: () => number;
}

export function createDeepAgentsAdapter(params: DeepAgentsAdapterParams): DeepAgentsAdapter {
  const checkpointer = PostgresSaver.fromConnString(params.connectionUri, {
    schema: CHECKPOINT_SCHEMA,
  });
  const model =
    params.model ??
    new ChatOpenAI({
      model: params.modelName,
      apiKey: params.openRouter?.apiKey,
      temperature: 0,
      configuration: params.openRouter
        ? {
            baseURL: params.openRouter.baseUrl,
          }
        : undefined,
    });
  const logger = params.logger ?? createNoopLogger();
  const clock = params.clock ?? Date.now;
  return {
    async setup() {
      await checkpointer.setup();
    },

    async invoke(input: RuntimeTurnInput): Promise<RuntimeTurnOutput> {
      const startedAt = clock();
      const systemPrompt =
        params.systemPrompt ??
        params.assemblePrompt?.({
          floor: input.pinnedFloor,
          trigger: input.trigger,
          userProfile: input.userProfile,
          recentPerception: input.recentPerception,
          firstRun: input.firstRun,
        });
      if (!systemPrompt) {
        throw new Error(
          "DeepAgents adapter requires a systemPrompt or assemblePrompt collaborator.",
        );
      }
      const agent = createDeepAgent({
        model,
        checkpointer,
        store: params.store as never,
        backend: params.backend,
        tools: params.createTools?.(input),
        systemPrompt,
      });
      // A langfuse CallbackHandler carries the active trace on mutable instance
      // state, so a single shared handler cross-attributes traces (and child
      // generations) when turns for different users overlap. Create a fresh
      // handler per turn so the trace this turn records is unambiguously its own.
      const callbackHandler = params.createCallbackHandler?.() ?? null;
      const callbacks = callbackHandler ? [callbackHandler] : undefined;
      let result: unknown;
      try {
        result = await agent.invoke(
          {
            messages: [
              {
                role: "user",
                content: input.body,
              },
            ],
          },
          {
            configurable: {
              thread_id: input.threadId,
              user_id: input.userId,
              trigger: input.trigger,
            },
            callbacks,
            metadata: {
              langfusePrompt: firstPromptHandle(input.pinnedFloor.langfusePrompts),
              langfuseUserId: input.userId,
              langfuseSessionId: input.threadId,
              bundle_version: input.pinnedFloor.version,
            },
          },
        );
      } catch (error) {
        logger.error("model.invoked", error, {
          user_id: input.userId,
          thread_id: input.threadId,
          trigger: input.trigger,
          model: params.modelName,
          status: "failed",
          duration_ms: clock() - startedAt,
        });
        throw error;
      }

      const traceId = callbackHandler?.getTraceId?.() ?? null;
      // Per-turn handler owns a per-turn buffer; flush it so the trace is not
      // lost to GC. Telemetry is best-effort and must not fail the turn.
      void callbackHandler?.flushAsync?.().catch(() => {});

      const usage = extractUsage(result);
      logger.info("model.invoked", {
        user_id: input.userId,
        thread_id: input.threadId,
        trace_id: traceId,
        trigger: input.trigger,
        model: params.modelName,
        status: "ok",
        duration_ms: clock() - startedAt,
        ...usage,
      });

      return {
        reply: extractReply(result),
        traceId,
        model: params.modelName,
        bundleVersion: input.pinnedFloor.version,
      };
    },
  };
}

function firstPromptHandle(handles: readonly unknown[]): unknown {
  return handles[0];
}

function extractReply(result: unknown): string {
  const messages = Array.isArray((result as { messages?: unknown }).messages)
    ? (result as { messages: unknown[] }).messages
    : [];
  let lastAiMessage: AIMessage | null = null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (AIMessage.isInstance(message)) {
      lastAiMessage = message;
      break;
    }
  }

  if (!lastAiMessage) {
    return "";
  }

  return typeof lastAiMessage.content === "string"
    ? lastAiMessage.content
    : JSON.stringify(lastAiMessage.content);
}

function extractUsage(result: unknown): { token_input?: number; token_output?: number } {
  const messages = Array.isArray((result as { messages?: unknown }).messages)
    ? (result as { messages: unknown[] }).messages
    : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const usage = (messages[i] as { usage_metadata?: unknown }).usage_metadata;
    if (!usage || typeof usage !== "object") {
      continue;
    }
    const inputTokens = (usage as { input_tokens?: unknown }).input_tokens;
    const outputTokens = (usage as { output_tokens?: unknown }).output_tokens;
    return {
      ...(typeof inputTokens === "number" ? { token_input: inputTokens } : {}),
      ...(typeof outputTokens === "number" ? { token_output: outputTokens } : {}),
    };
  }
  return {};
}
