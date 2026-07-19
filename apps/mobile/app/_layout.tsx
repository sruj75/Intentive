import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { getPlatform } from "../src/entrypoints/platform";
import { resolveLaunchState } from "../src/domains/onboarding/service/resolve-launch-state";
import { routeForDestination } from "../src/domains/onboarding/service/route-for-destination";
import { LaunchStateProvider, useLaunchState } from "../src/providers/launch-state";
import { ProfileProvider } from "../src/providers/profile/profile-provider";
import { wrapRoot } from "../src/providers/telemetry";

// Build the composition root at module load: constructing it runs `initTelemetry`,
// so `wrapRoot` below sees a ready Sentry when a DSN is configured (ADR 0029). A
// blank DSN keeps telemetry the no-op and `wrapRoot` returns the component as-is.
getPlatform();

/**
 * Runs the launch decision as an effect: resolve the in-memory Launch State to a
 * Launch Destination, map it to a Launch Route, and replace into the target zone.
 * A `splash` route (state still RESOLVING) does nothing, leaving the default `/`
 * route mounted until `GET /me` hydrates. This replaces the old "cold launch
 * always → `/`" rule with Control-Plane gate truth (ADR 0025).
 */
function RootNavigator(): null {
  const { state } = useLaunchState();
  const route = routeForDestination(resolveLaunchState(state));
  const target = route.kind === "replace" ? route.zone : null;
  useEffect(() => {
    if (target !== null) router.replace(target);
  }, [target]);
  return null;
}

function RootLayout(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ProfileProvider>
        <LaunchStateProvider source={getPlatform().launchStateSource}>
          <RootNavigator />
          <Stack screenOptions={{ headerShown: false, animation: "none" }} />
        </LaunchStateProvider>
      </ProfileProvider>
    </GestureHandlerRootView>
  );
}

// Sentry's error boundary + performance wrapper when a DSN is configured; the
// identity function otherwise (ADR 0029).
export default wrapRoot(RootLayout);
