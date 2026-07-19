import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { router } from "expo-router";

import { ScreenFrame } from "../design/screen-frame";
import type { AuthAdapter, AuthProviderId } from "../domains/auth/types/auth";
import { AuthScene } from "../domains/auth/ui/auth-scene";
import { createOnboardingJourneyController } from "../domains/onboarding/service/onboarding-journey";
import {
  FriendsIntroScene,
  NameScene,
  PermissionsIntroScene,
} from "../domains/onboarding/ui/onboarding-scenes";
import { useProfileStore } from "../providers/profile/profile-provider";

export function OnboardingEntry({
  onComplete,
  onSignedIn,
  authAdapter,
}: {
  readonly onComplete?: () => void;
  /**
   * Launch State notification: a real sign-in landed. The route injects
   * `store.markSignedIn` so the `RootNavigator` reconciles gate truth. Omitted on
   * the offline/dev default path, which makes no Launch State calls.
   */
  readonly onSignedIn?: () => void;
  /**
   * The composed Auth Adapter (route → composition root). When omitted, the
   * Identity Gate advances locally with no capability calls — the offline/dev
   * default the `experience-journey` invariant test drives.
   */
  readonly authAdapter?: AuthAdapter;
} = {}) {
  const profile = useProfileStore();
  const [phase, setPhase] = useState<"auth" | "journey">("auth");

  const handleSignIn = useCallback(
    async (provider: AuthProviderId) => {
      if (!authAdapter) {
        setPhase("journey");
        return;
      }
      const outcome = await authAdapter.signIn(provider);
      // Advance only on a real authenticated outcome; cancelled/not-configured/
      // error leave the user on the Identity Gate (the adapter captures failures).
      if (outcome.status === "signed-in") {
        onSignedIn?.();
        setPhase("journey");
      }
    },
    [authAdapter, onSignedIn],
  );
  const journey = useMemo(() => createOnboardingJourneyController(), []);
  const snapshot = useSyncExternalStore(
    journey.subscribe,
    journey.getSnapshot,
    journey.getSnapshot,
  );
  useEffect(() => () => journey.dispose(), [journey]);

  const complete = (fullName: string) => {
    profile.setName(fullName);
    if (onComplete) onComplete();
    else router.replace("/chat");
  };

  let scene: React.JSX.Element;
  if (phase === "auth") {
    scene = <AuthScene onSignIn={handleSignIn} />;
  } else if (snapshot.stage === "name") {
    scene = (
      <NameScene
        onNameEdited={(value) => journey.dispatch({ type: "name_edited", value })}
        onNameSubmitted={() => journey.dispatch({ type: "name_submitted" })}
        snapshot={snapshot}
      />
    );
  } else if (snapshot.stage === "friends_intro") {
    scene = <FriendsIntroScene onAdvance={() => journey.dispatch({ type: "advanced" })} />;
  } else if (snapshot.stage === "permissions_intro") {
    scene = (
      <PermissionsIntroScene
        onAdvance={() => {
          journey.dispatch({ type: "advanced" });
          const completed = journey.getSnapshot();
          if (completed.stage === "complete") complete(completed.fullName);
        }}
      />
    );
  } else {
    scene = <></>;
  }

  return <ScreenFrame sceneKey={phase === "auth" ? "auth" : snapshot.stage}>{scene}</ScreenFrame>;
}
