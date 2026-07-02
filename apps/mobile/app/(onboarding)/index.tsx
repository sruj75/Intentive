/**
 * Onboarding funnel route — thin shell. As a composition point (not layer-linted)
 * it is the one place allowed to wire the `notifications` domain's port to the
 * `onboarding` domain's Grant Permissions step, keeping that cross-domain wiring
 * out of the domain UI. The funnel owns its own local step sequencing.
 */
import { createExpoNotificationsPort } from "../../src/domains/notifications/repo/expo-notifications-port";
import { OnboardingFunnel } from "../../src/domains/onboarding/ui/onboarding-funnel";

const notificationsPort = createExpoNotificationsPort();

export default function OnboardingRoute(): React.JSX.Element {
  return (
    <OnboardingFunnel requestNotificationPermission={() => notificationsPort.requestPermission()} />
  );
}
