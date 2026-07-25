import { useCallback, useEffect, useMemo, useState } from "react";
import { router } from "expo-router";

import { ScreenFrame } from "../design/screen-frame";
import { AccountSettingsBoundary } from "../domains/account/ui/account-settings";
import { deriveFeatureAccess } from "../domains/account/service/feature-access";
import { createLocalConversationSession } from "../domains/chat/runtime/local-conversation-session";
import type { ConversationSession } from "../domains/chat/types/conversation-timeline";
import { ComposerBoundary } from "../domains/chat/ui/composer-boundary";
import { ConversationScene } from "../domains/chat/ui/conversation-scene";
import { EducationDeck } from "../domains/onboarding/ui/education-deck";
import { useAccountStateProjection } from "../providers/account-state";
import type { AccountStateSource } from "../providers/account-state";
import { useProfileSnapshot, useProfileStore } from "../providers/profile/profile-provider";

const defaultCreateSession = (firstName: string) => createLocalConversationSession({ firstName });

export function ChatEntry({
  createSession = defaultCreateSession,
  accountStateSource,
  onLogout,
}: {
  readonly createSession?: (firstName: string) => ConversationSession;
  readonly accountStateSource?: AccountStateSource;
  readonly onLogout?: () => void | Promise<void>;
} = {}) {
  const profileStore = useProfileStore();
  const profile = useProfileSnapshot();
  // Real Control-Plane account state gates Companion affordances. With no injected
  // source (the offline default) this projects null, so the gate stays open and
  // the local experience is unchanged (ADR-0027). `refreshAccountState` is the
  // seam the education replay restart uses so feature gating reflects updated
  // account state instead of remaining stuck on the original projection (ADR-0030).
  const { accountState, refreshAccountState } = useAccountStateProjection(accountStateSource);
  const featureAccess = deriveFeatureAccess(accountState);
  const [mode, setMode] = useState<"welcome" | "education" | "ready">("welcome");
  const [sessionGeneration, setSessionGeneration] = useState(0);
  const [educationSource, setEducationSource] = useState<"onboarding" | "replay">("onboarding");
  const session = useMemo(
    () => createSession(profile.firstName),
    [createSession, profile.firstName, sessionGeneration],
  );
  useEffect(() => () => session.dispose(), [session]);

  const logout = useCallback(() => {
    void (async () => {
      if (onLogout) {
        try {
          // The live boundary clears the durable auth session before reporting
          // signed-out Launch State. Keep the in-memory profile intact when that
          // operation fails so the UI never claims a session was cleared when it
          // still exists in SecureStore.
          await onLogout();
        } catch {
          return;
        }
      }

      profileStore.reset();
      if (!onLogout) router.replace("/");
    })();
  }, [onLogout, profileStore]);

  // Education replay becomes one named restart operation: when the Education Deck
  // returns from a *replay*, a fresh conversation session is created (bumping the
  // generation disposes the prior runtime/local session) and Account State is
  // refreshed before the ready surface returns, so updated feature access can
  // change gating after the replay (ADR-0030). The first onboarding run keeps the
  // welcome session and only refreshes nothing — no extra reads.
  const restartConversation = useCallback(async (): Promise<void> => {
    if (educationSource === "replay") {
      setSessionGeneration((current) => current + 1);
      if (accountStateSource) {
        await refreshAccountState({ clearBeforeRead: true });
      }
    }
    setMode("ready");
  }, [accountStateSource, educationSource, refreshAccountState]);

  return (
    <AccountSettingsBoundary fullName={profile.fullName} initials={profile.initials}>
      {({ proactiveSuggestions, renderSettings }) => (
        <ComposerBoundary>
          {({ onChange, value }) => (
            <ScreenFrame sceneKey={mode === "education" ? "education" : "chat"}>
              {mode === "education" ? (
                <EducationDeck onComplete={restartConversation} />
              ) : (
                <ConversationScene
                  composerValue={value}
                  firstName={profile.firstName}
                  initials={profile.initials}
                  mode={mode}
                  onBeginEducation={() => {
                    setEducationSource("onboarding");
                    setMode("education");
                  }}
                  onComposerChange={onChange}
                  onLogout={logout}
                  onReplayEducation={() => {
                    setEducationSource("replay");
                    setMode("education");
                  }}
                  proactiveSuggestions={proactiveSuggestions && featureAccess.proactiveSuggestions}
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
