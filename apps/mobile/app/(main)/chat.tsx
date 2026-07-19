import { ChatEntry } from "../../src/entrypoints/chat-entry";
import { getPlatform } from "../../src/entrypoints/platform";

// The route composes the real Chat Runtime: each mount builds an Agent-Runtime-
// backed ConversationSession, replacing ChatEntry's offline local-session default
// (ADR-0026). The reference is module-level so ChatEntry's session memo is stable
// across renders — a fresh connection opens only on mount / education replay.
const createRuntimeSession = () => getPlatform().createRuntimeSession();

export default function ChatRoute(): React.JSX.Element {
  // The route also composes the real Account State seam (ADR-0027): the shared
  // `GET /me` projection gates Companion affordances (proactive suggestions).
  return (
    <ChatEntry
      accountStateSource={getPlatform().accountStateSource}
      createSession={createRuntimeSession}
    />
  );
}
