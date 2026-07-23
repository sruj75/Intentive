import { OnboardingEntry } from "../../src/entrypoints/onboarding-entry";
import { getPlatform } from "../../src/entrypoints/platform";
import { useLaunchState } from "../../src/providers/launch-state";

export default function OnboardingRoute(): React.JSX.Element {
  // The route composes the real seams: the Auth Adapter drives the Identity Gate,
  // and Launch State callbacks report gate progress so the RootNavigator (in the
  // root layout) owns the actual `/` ↔ `/chat` navigation. `completeOnboardingFunnel`
  // folds the shared Pre-Chat Gates the two-zone funnel stands in for (ADR 0025).
  // `googleAuthConfigured` is the Identity Gate's single capability (ADR 0030).
  const launch = useLaunchState();
  return (
    <OnboardingEntry
      authAdapter={getPlatform().auth}
      googleAuthConfigured={getPlatform().config.googleAuthConfigured}
      onSignedIn={launch.markSignedIn}
      onComplete={launch.completeOnboardingFunnel}
    />
  );
}
