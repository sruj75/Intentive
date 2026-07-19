import { Stack } from "expo-router";

import { NotificationsRegistrar } from "../../src/entrypoints/notifications-registrar";
import { getPlatform } from "../../src/entrypoints/platform";
import { useLaunchState } from "../../src/providers/launch-state";

// Module-level so the registrar's effect dependency stays stable across renders;
// a fresh arrow each render would re-arm the one-shot registration attempt.
const registerForPush = () => getPlatform().registerForPush();

export default function MainLayout(): React.JSX.Element {
  // The (main) zone is only reached signed in, so its mount is the push-
  // registration seam point (ADR 0028): request permission and register the
  // device for push once the launch state confirms a signed-in client.
  const { state } = useLaunchState();
  return (
    <>
      <NotificationsRegistrar signedIn={state.signedIn === true} register={registerForPush} />
      <Stack screenOptions={{ headerShown: false, animation: "none" }} />
    </>
  );
}
