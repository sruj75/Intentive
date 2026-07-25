import { useCallback } from "react";

import { ChatEntry } from "../../src/entrypoints/chat-entry";
import { getPlatform } from "../../src/entrypoints/platform";
import { useLaunchState } from "../../src/providers/launch-state";

// The route composes the real Chat Runtime: each mount builds an Agent-Runtime-
// backed ConversationSession, replacing ChatEntry's offline local-session default
// (ADR-0026). The reference is module-level so ChatEntry's session memo is stable
// across renders — a fresh connection opens only on mount / education replay.
const createRuntimeSession = () => getPlatform().createRuntimeSession();

export default function ChatRoute(): React.JSX.Element {
  const { markSignedOut } = useLaunchState();
  const platform = getPlatform();
  const logout = useCallback(async (): Promise<void> => {
    // Durable auth truth leads the transition. If Neon/SecureStore sign-out
    // fails, this rejects and ChatEntry keeps both Launch State and the profile
    // intact rather than presenting a signed-out session that still restores.
    await platform.auth.signOut();
    markSignedOut();
  }, [markSignedOut, platform]);

  // The route also composes the real Account State seam (ADR-0027): the shared
  // `GET /me` projection gates Companion affordances (proactive suggestions).
  return (
    <ChatEntry
      accountStateSource={platform.accountStateSource}
      createSession={createRuntimeSession}
      developmentAuthBypassEnabled={platform.config.devAuthBypassEnabled}
      onLogout={logout}
    />
  );
}
