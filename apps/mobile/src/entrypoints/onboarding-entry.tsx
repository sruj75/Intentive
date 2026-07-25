import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { router } from "expo-router";

import { ScreenFrame } from "../design/screen-frame";
import { authContent } from "../domains/auth/config/content";
import type { AuthAdapter, SignInOutcome } from "../domains/auth/types/auth";
import { AuthScene } from "../domains/auth/ui/auth-scene";
import { createOnboardingJourneyController } from "../domains/onboarding/service/onboarding-journey";
import {
  ConsentScene,
  FriendsIntroScene,
  NameScene,
  PermissionsIntroScene,
} from "../domains/onboarding/ui/onboarding-scenes";
import { onboardingContent } from "../domains/onboarding/config/content";
import { useProfileStore } from "../providers/profile/profile-provider";

export function OnboardingEntry({
  googleAuthConfigured = true,
  signedIn,
  consentRequired = false,
  onComplete,
  onAcceptConsent,
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
  /** Hydrated Launch State identity truth. Omitted by the capability-free harness. */
  readonly signedIn?: boolean | null;
  /** Whether Control Plane currently reports the Consent Primer as outstanding. */
  readonly consentRequired?: boolean | null;
  readonly onComplete?: () => void | Promise<void>;
  /** Persist explicit Data & Privacy acceptance and reconcile Launch State. */
  readonly onAcceptConsent?: () => Promise<void>;
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
  const [phase, setPhase] = useState<"auth" | "resolving" | "consent" | "journey">(
    signedIn === true
      ? consentRequired === null
        ? "resolving"
        : consentRequired
          ? "consent"
          : "journey"
      : "auth",
  );
  const [authPending, setAuthPending] = useState(false);
  const [consentPending, setConsentPending] = useState(false);
  const [consentNotice, setConsentNotice] = useState<string | null>(null);
  const [completionPending, setCompletionPending] = useState(false);
  const [completionNotice, setCompletionNotice] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(
    googleAuthConfigured ? null : authContent.notConfiguredNotice,
  );
  const disabled = !googleAuthConfigured;

  useEffect(() => {
    if (signedIn !== true) return;
    if (consentRequired === null) {
      setPhase("resolving");
      return;
    }
    setPhase(consentRequired ? "consent" : "journey");
  }, [consentRequired, signedIn]);

  const advance = useCallback(() => {
    if (onSignedIn) {
      setPhase("resolving");
      onSignedIn();
      return;
    }
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

  const complete = async (fullName: string): Promise<void> => {
    if (completionPending) return;
    profile.setName(fullName);
    if (!onComplete) {
      router.replace("/chat");
      return;
    }
    setCompletionPending(true);
    setCompletionNotice(null);
    try {
      await onComplete();
      journey.dispatch({ type: "advanced" });
    } catch {
      setCompletionNotice(onboardingContent.consent.completionError);
    } finally {
      setCompletionPending(false);
    }
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
  } else if (phase === "resolving") {
    scene = <></>;
  } else if (phase === "consent") {
    scene = (
      <ConsentScene
        notice={consentNotice}
        onAccept={() => {
          if (consentPending || !onAcceptConsent) return;
          setConsentPending(true);
          setConsentNotice(null);
          void onAcceptConsent()
            .then(() => setPhase("journey"))
            .catch(() => setConsentNotice(onboardingContent.consent.error))
            .finally(() => setConsentPending(false));
        }}
        pending={consentPending}
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
        notice={completionNotice}
        pending={completionPending}
        onAdvance={() => {
          void complete(snapshot.fullName);
        }}
      />
    );
  } else {
    scene = <></>;
  }

  return <ScreenFrame sceneKey={phase === "journey" ? snapshot.stage : phase}>{scene}</ScreenFrame>;
}
