import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { router } from "expo-router";

import { ScreenFrame } from "../design/screen-frame";
import { authContent } from "../domains/auth/config/content";
import type { AuthAdapter, SignInOutcome } from "../domains/auth/types/auth";
import { AuthScene } from "../domains/auth/ui/auth-scene";
import { createOnboardingJourneyController } from "../domains/onboarding/service/onboarding-journey";
import {
  FriendsIntroScene,
  NameScene,
  PermissionsIntroScene,
} from "../domains/onboarding/ui/onboarding-scenes";
import { useProfileStore } from "../providers/profile/profile-provider";

export function OnboardingEntry({
  googleAuthConfigured = true,
  onComplete,
  onSignedIn,
  authAdapter,
}: {
  /**
   * Whether Google is a working capability (both public client IDs present).
   * The Identity Gate disables its single button and shows an actionable notice
   * when this is false (ADR 0030). Defaults to true so the offline/dev default
   * path (no injected adapter) keeps the Google button enabled for the local
   * walk the `experience-journey` invariant test drives.
   */
  readonly googleAuthConfigured?: boolean;
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
  const [authPending, setAuthPending] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(
    googleAuthConfigured ? null : authContent.notConfiguredNotice,
  );
  const disabled = !googleAuthConfigured;

  const advance = useCallback(() => {
    onSignedIn?.();
    setPhase("journey");
  }, [onSignedIn]);

  const handlePress = useCallback(() => {
    if (authPending || disabled) return;
    setAuthNotice(null);
    const run = async (): Promise<void> => {
      setAuthPending(true);
      try {
        // The offline default (no adapter) advances with ZERO capability calls.
        // A real adapter run awaits the exchange and projects the outcome.
        const outcome: SignInOutcome = authAdapter
          ? await authAdapter.signIn()
          : { status: "signed-in" };
        if (outcome.status === "signed-in") {
          advance();
          return;
        }
        if (outcome.status === "cancelled") {
          // Cancellation is silent: no notice, stay on the gate.
          return;
        }
        setAuthNotice(
          outcome.status === "not-configured"
            ? authContent.notConfiguredNotice
            : authContent.retryNotice,
        );
      } catch {
        // The adapter normally maps native failures into a recoverable outcome,
        // but an unexpected throw must still release the button and offer retry.
        setAuthNotice(authContent.retryNotice);
      } finally {
        setAuthPending(false);
      }
    };
    void run();
  }, [authAdapter, authPending, disabled, advance]);

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
    scene = (
      <AuthScene
        disabled={disabled}
        notice={authNotice}
        onPress={handlePress}
        pending={authPending}
      />
    );
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
