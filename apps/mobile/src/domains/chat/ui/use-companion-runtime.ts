import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { AppendMessage, ExternalStoreAdapter, ThreadMessageLike } from "@assistant-ui/core";

import type { ConversationMessage, RuntimeAdapter } from "../types/conversation.js";

export function useCompanionRuntime(
  adapter: RuntimeAdapter,
): ExternalStoreAdapter<ConversationMessage> {
  const state = useSyncExternalStore(adapter.subscribe, adapter.getState, adapter.getState);

  useEffect(() => {
    void adapter.connect();
    return () => adapter.close();
  }, [adapter]);

  return useMemo(
    () => ({
      messages: state.messages,
      isRunning: state.agentState === "thinking",
      isSendDisabled: state.connectionState === "error",
      convertMessage,
      onNew: async (message: AppendMessage) => {
        await adapter.sendUserMessage(getAppendMessageText(message));
      },
    }),
    [adapter, state.agentState, state.connectionState, state.messages],
  );
}

function convertMessage(message: ConversationMessage): ThreadMessageLike {
  const role = message.author === "companion" ? "assistant" : "user";
  return {
    id: message.id,
    role,
    content: [{ type: "text", text: message.body }],
    createdAt: new Date(message.at),
    ...(role === "assistant"
      ? { status: { type: "complete" as const, reason: "stop" as const } }
      : {}),
    metadata: {
      custom: {
        delivery: message.delivery ?? null,
        viaPostMessageBack: message.viaPostMessageBack,
      },
    },
  };
}

function getAppendMessageText(message: AppendMessage): string {
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}
