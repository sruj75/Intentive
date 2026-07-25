import { OnboardingEntry } from "../../src/entrypoints/onboarding-entry";
import { getPlatform } from "../../src/entrypoints/platform";
import { useLaunchState } from "../../src/providers/launch-state";

export default function OnboardingRoute(): React.JSX.Element {
  // The route composes the real seams: the Auth Adapter drives the Identity Gate,
  // and Launch State callbacks report gate progress so the RootNavigator (in the
  // root layout) owns the actual `/` ↔ `/chat` navigation. Shared gate callbacks
  // persist to the Control Plane and reconcile before READY can be observed.
  // `googleAuthConfigured` is the Identity Gate's single capability (ADR 0030).
  const launch = useLaunchState();
  const platform = getPlatform();
  return (
    <OnboardingEntry
      authAdapter={platform.auth}
      developmentAuthBypassEnabled={platform.config.devAuthBypassEnabled}
      googleAuthConfigured={platform.config.googleAuthConfigured}
      signedIn={launch.state.signedIn}
      consentRequired={launch.state.consent === null ? null : launch.state.consent === "pending"}
      onSignedIn={launch.markSignedIn}
      onAcceptConsent={launch.acceptConsent}
      onComplete={launch.completeOnboardingFunnel}
    />
  );
}
