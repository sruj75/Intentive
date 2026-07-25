import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { router } from "expo-router";

import { ScreenFrame } from "../design/screen-frame";
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
  developmentAuthBypassEnabled = false,
}: {
  /**
   * Whether Google is a working capability (both public client IDs present).
   * The Identity Gate disables its single button when this is false (ADR 0030).
   * Defaults to true so the offline/dev default path (no injected adapter)
   * keeps the Google button enabled for the local walk the
   * `experience-journey` invariant test drives.
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
  /**
   * Development-only experience selection. The entrypoint, rather than its Expo
   * route, owns the capability-free post-auth composition: no Auth Adapter,
   * SecureStore, Launch State mutation, or Control Plane seam is invoked.
   */
  readonly developmentAuthBypassEnabled?: boolean;
} = {}) {
  const effectiveSignedIn = developmentAuthBypassEnabled ? true : signedIn;
  const effectiveConsentRequired = developmentAuthBypassEnabled ? false : consentRequired;
  const effectiveOnComplete = developmentAuthBypassEnabled ? undefined : onComplete;
  const effectiveOnAcceptConsent = developmentAuthBypassEnabled ? undefined : onAcceptConsent;
  const effectiveOnSignedIn = developmentAuthBypassEnabled ? undefined : onSignedIn;
  const effectiveAuthAdapter = developmentAuthBypassEnabled ? undefined : authAdapter;
  const profile = useProfileStore();
  const [phase, setPhase] = useState<"auth" | "resolving" | "consent" | "journey">(
    effectiveSignedIn === true
      ? effectiveConsentRequired === null
        ? "resolving"
        : effectiveConsentRequired
          ? "consent"
          : "journey"
      : "auth",
  );
  const [authPending, setAuthPending] = useState(false);
  const [consentPending, setConsentPending] = useState(false);
  const [consentNotice, setConsentNotice] = useState<string | null>(null);
  const [completionPending, setCompletionPending] = useState(false);
  const [completionNotice, setCompletionNotice] = useState<string | null>(null);
  const disabled = !googleAuthConfigured;

  useEffect(() => {
    if (effectiveSignedIn !== true) return;
    if (effectiveConsentRequired === null) {
      setPhase("resolving");
      return;
    }
    setPhase(effectiveConsentRequired ? "consent" : "journey");
  }, [effectiveConsentRequired, effectiveSignedIn]);

  const advance = useCallback(() => {
    if (effectiveOnSignedIn) {
      setPhase("resolving");
      effectiveOnSignedIn();
      return;
    }
    setPhase("journey");
  }, [effectiveOnSignedIn]);

  const handlePress = useCallback(() => {
    if (authPending || disabled) return;
    const run = async (): Promise<void> => {
      setAuthPending(true);
      try {
        // The offline default (no adapter) advances with ZERO capability calls.
        // A real adapter run awaits the exchange and projects the outcome.
        const outcome: SignInOutcome = effectiveAuthAdapter
          ? await effectiveAuthAdapter.signIn()
          : { status: "signed-in" };
        if (outcome.status === "signed-in") {
          advance();
          return;
        }
        if (outcome.status === "cancelled") {
          // Cancellation is silent: stay on the gate.
          return;
        }
      } catch {
        // Auth errors do not insert layout below the button. The adapter owns
        // telemetry; finally releases the button so another attempt is possible.
      } finally {
        setAuthPending(false);
      }
    };
    void run();
  }, [effectiveAuthAdapter, authPending, disabled, advance]);

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
    if (!effectiveOnComplete) {
      router.replace("/chat");
      return;
    }
    setCompletionPending(true);
    setCompletionNotice(null);
    try {
      await effectiveOnComplete();
      journey.dispatch({ type: "advanced" });
    } catch {
      setCompletionNotice(onboardingContent.consent.completionError);
    } finally {
      setCompletionPending(false);
    }
  };

  let scene: React.JSX.Element;
  if (phase === "auth") {
    scene = <AuthScene disabled={disabled} onPress={handlePress} pending={authPending} />;
  } else if (phase === "resolving") {
    scene = <></>;
  } else if (phase === "consent") {
    scene = (
      <ConsentScene
        notice={consentNotice}
        onAccept={() => {
          if (consentPending || !effectiveOnAcceptConsent) return;
          setConsentPending(true);
          setConsentNotice(null);
          void effectiveOnAcceptConsent()
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
