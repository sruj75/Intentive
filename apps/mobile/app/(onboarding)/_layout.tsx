/**
 * Onboarding funnel zone — shared chrome (no header). The funnel steps forward
 * with LOCAL state inside `OnboardingFunnel`, not with routes, so this zone is a
 * single screen; the gate sequence and route replacements are owned by the root
 * layout's resolver, not here.
 */
import { Stack } from "expo-router";

export default function OnboardingLayout(): React.JSX.Element {
  return <Stack screenOptions={{ headerShown: false }} />;
}
