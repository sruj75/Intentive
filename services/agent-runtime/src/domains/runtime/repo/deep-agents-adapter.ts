import { AIMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { ChatOpenAI } from "@langchain/openai";
import { createDeepAgent } from "deepagents";

import type { DeepAgentsAdapter, RuntimeTurnInput, RuntimeTurnOutput } from "../types/turn.js";

const CHECKPOINT_SCHEMA = "agent_runtime";

interface DeepAgentsAdapterParams {
  readonly connectionUri: string;
  readonly modelName: string;
  readonly systemPrompt: string;
  readonly model?: BaseChatModel;
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
  const agent = createDeepAgent({
    model,
    checkpointer,
    systemPrompt: params.systemPrompt,
  });

  return {
    async setup() {
      await checkpointer.setup();
    },

    async invoke(input: RuntimeTurnInput): Promise<RuntimeTurnOutput> {
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
          },
        },
      );

      return {
        reply: extractReply(result),
        traceId: null,
        model: params.modelName,
      };
    },
  };
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
