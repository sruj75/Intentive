import { useEffect, useMemo, useState } from "react";
import { router } from "expo-router";

import { ScreenFrame } from "../design/screen-frame";
import { AccountSettingsBoundary } from "../domains/account/ui/account-settings";
import { createLocalConversationSession } from "../domains/chat/runtime/local-conversation-session";
import type { ConversationSession } from "../domains/chat/types/conversation-timeline";
import { ComposerBoundary } from "../domains/chat/ui/composer-boundary";
import { ConversationScene } from "../domains/chat/ui/conversation-scene";
import { EducationDeck } from "../domains/onboarding/ui/education-deck";
import { useProfileSnapshot, useProfileStore } from "../providers/profile/profile-provider";

const defaultCreateSession = (firstName: string) => createLocalConversationSession({ firstName });

export function ChatEntry({
  createSession = defaultCreateSession,
  onLogout,
}: {
  readonly createSession?: (firstName: string) => ConversationSession;
  readonly onLogout?: () => void;
} = {}) {
  const profileStore = useProfileStore();
  const profile = useProfileSnapshot();
  const [mode, setMode] = useState<"welcome" | "education" | "ready">("welcome");
  const [sessionGeneration, setSessionGeneration] = useState(0);
  const session = useMemo(
    () => createSession(profile.firstName),
    [createSession, profile.firstName, sessionGeneration],
  );
  useEffect(() => () => session.dispose(), [session]);

  const logout = () => {
    profileStore.reset();
    if (onLogout) onLogout();
    else router.replace("/");
  };

  return (
    <AccountSettingsBoundary fullName={profile.fullName} initials={profile.initials}>
      {({ proactiveSuggestions, renderSettings }) => (
        <ComposerBoundary>
          {({ onChange, value }) => (
            <ScreenFrame sceneKey={mode === "education" ? "education" : "chat"}>
              {mode === "education" ? (
                <EducationDeck onComplete={() => setMode("ready")} />
              ) : (
                <ConversationScene
                  composerValue={value}
                  firstName={profile.firstName}
                  initials={profile.initials}
                  mode={mode}
                  onBeginEducation={() => setMode("education")}
                  onComposerChange={onChange}
                  onLogout={logout}
                  onReplayEducation={() => {
                    setSessionGeneration((current) => current + 1);
                    setMode("education");
                  }}
                  proactiveSuggestions={proactiveSuggestions}
                  renderSettings={renderSettings}
                  session={session}
                />
              )}
            </ScreenFrame>
          )}
        </ComposerBoundary>
      )}
    </AccountSettingsBoundary>
  );
}
