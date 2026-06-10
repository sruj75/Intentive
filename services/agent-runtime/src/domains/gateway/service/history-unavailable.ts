import type { RuntimeError } from "@intentive/protocol";

export function conversationHistoryUnavailableError(): RuntimeError {
  return {
    type: "runtime_error",
    code: "service_unavailable",
    message: "Conversation history is temporarily unavailable.",
  };
}
