import { AIMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseCallbackHandler } from "@langchain/core/callbacks/base";
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
  readonly openRouter?: {
    readonly apiKey: string;
    readonly baseUrl: string;
  };
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
  return {
    async setup() {
      await checkpointer.setup();
    },

    async invoke(input: RuntimeTurnInput): Promise<RuntimeTurnOutput> {
      const systemPrompt =
        params.systemPrompt ??
        params.assemblePrompt?.({
          floor: input.pinnedFloor,
          trigger: input.trigger,
          userProfile: input.userProfile,
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
        systemPrompt,
      });
      // A langfuse CallbackHandler carries the active trace on mutable instance
      // state, so a single shared handler cross-attributes traces (and child
      // generations) when turns for different users overlap. Create a fresh
      // handler per turn so the trace this turn records is unambiguously its own.
      const callbackHandler = params.createCallbackHandler?.() ?? null;
      const callbacks = callbackHandler ? [callbackHandler] : undefined;
      const result = await agent.invoke(
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

      const traceId = callbackHandler?.getTraceId?.() ?? null;
      // Per-turn handler owns a per-turn buffer; flush it so the trace is not
      // lost to GC. Telemetry is best-effort and must not fail the turn.
      void callbackHandler?.flushAsync?.().catch(() => {});

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
