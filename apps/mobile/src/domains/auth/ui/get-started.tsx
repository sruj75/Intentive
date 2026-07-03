/**
 * Get Started — the pre-auth landing, the first thing a cold, signed-out user
 * sees. It is NOT a gate (there is no signed-in truth to project yet): it renders
 * as the first view of the signed-out `/(gates)/identity` zone and steps forward
 * LOCALLY to the sign-in options via the injected `onContinue`. It writes nothing
 * to Launch State and never navigates across a gate boundary.
 *
 * The visual shell uses local placeholder art that can be replaced with
 * Intentive-owned photography without changing gate behavior.
 */
import {
  OnboardingAction,
  OnboardingBody,
  OnboardingFinePrint,
  OnboardingScreen,
  OnboardingTitle,
} from "../../../design/onboarding";

export function GetStarted({ onContinue }: { onContinue: () => void }): React.JSX.Element {
  return (
    <OnboardingScreen
      backdrop="welcome"
      backdropLabel="Person using Intentive on iPhone and Mac"
      sheetMaxHeightRatio={0.46}
    >
      <OnboardingTitle>Intentive</OnboardingTitle>
      <OnboardingBody>
        A proactive companion that remembers your context and stays with you across iPhone and Mac.
      </OnboardingBody>
      <OnboardingAction label="Get Started" onPress={onContinue} />
      <OnboardingFinePrint>
        Built for one calm relationship with your companion, not another dashboard to manage.
      </OnboardingFinePrint>
    </OnboardingScreen>
  );
}
