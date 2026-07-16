import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { router } from "expo-router";

import { ScreenFrame } from "../design/screen-frame";
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
}: {
  readonly onComplete?: () => void;
} = {}) {
  const profile = useProfileStore();
  const [phase, setPhase] = useState<"auth" | "journey">("auth");
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
    scene = <AuthScene onAuthenticated={() => setPhase("journey")} />;
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
