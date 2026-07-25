import { useEffect } from "react";
import { Stack, router } from "expo-router";

import { resolveLaunchState } from "../domains/onboarding/service/resolve-launch-state";
import { routeForDestination } from "../domains/onboarding/service/route-for-destination";
import { LaunchStateProvider, useLaunchState } from "../providers/launch-state";
import type { LaunchStateSource } from "../providers/launch-state/source";
import { LaunchCurtain } from "./launch-curtain";
import { NotificationsRegistrar } from "./notifications-registrar";
import type { Platform } from "./platform";

const DEV_AUTH_BYPASS_SOURCE: LaunchStateSource = {
  read: async () => ({
    signedIn: false,
    consent: null,
    onboarding: null,
    siblingInvitation: null,
    trial: null,
  }),
};

function RootNavigator(): null {
  const { state } = useLaunchState();
  const route = routeForDestination(resolveLaunchState(state));
  const target = route.kind === "replace" ? route.zone : null;
  useEffect(() => {
    if (target !== null) router.replace(target);
  }, [target]);
  return null;
}

function LiveRootExperience({
  registerForPush,
}: {
  readonly registerForPush: Platform["registerForPush"];
}): React.JSX.Element {
  // Push registration owns the persistent signed-in lifecycle (ADR 0028 / 0030):
  // it lives above both navigation zones and becomes eligible only after the
  // user reaches chat.
  const { state } = useLaunchState();
  const registrationReady = resolveLaunchState(state) === "READY_FOR_CHAT";
  return (
    <>
      <RootNavigator />
      <NotificationsRegistrar registrationReady={registrationReady} register={registerForPush} />
      <Stack screenOptions={{ headerShown: false, animation: "none" }} />
      <LaunchCurtain />
    </>
  );
}

/**
 * Owns the root experience selection so Expo route files remain composition-only.
 * The development bypass deliberately supplies a signed-out local Launch State
 * source and omits live navigation, push registration, and launch-curtain seams.
 */
export function RootEntry({ platform }: { readonly platform: Platform }): React.JSX.Element {
  const bypass = platform.config.devAuthBypassEnabled;
  return (
    <LaunchStateProvider source={bypass ? DEV_AUTH_BYPASS_SOURCE : platform.launchStateSource}>
      {bypass ? (
        <Stack screenOptions={{ headerShown: false, animation: "none" }} />
      ) : (
        <LiveRootExperience registerForPush={platform.registerForPush} />
      )}
    </LaunchStateProvider>
  );
}
