/**
 * Root layout — composition root for the navigation axis. This is the one place
 * allowed to wire providers to a domain service (it is not under `src/` and is
 * not lint-checked). It owns the single reactive route replacement: it reads the
 * shared Launch State, runs the resolver, and replaces to the matching route zone
 * whenever the destination changes. Gate screens never navigate themselves.
 */
import { useEffect } from "react";
import { Stack, useRouter } from "expo-router";

import { createAuthAdapter } from "../src/domains/auth/service/auth-adapter";
import {
  NEON_ENABLED_PROVIDERS,
  createNeonAuthClient,
} from "../src/domains/auth/service/neon-client";
import { AuthAdapterProvider } from "../src/domains/auth/ui/auth-context";
import { resolveLaunchState } from "../src/domains/onboarding/service/resolve-launch-state";
import { routeForDestination } from "../src/domains/onboarding/service/route-for-destination";
import {
  LaunchStateProvider,
  createControlPlaneLaunchStateSource,
  useLaunchState,
} from "../src/providers/launch-state";

/**
 * The single real Auth Adapter, built once from the Neon client. No social
 * provider is a working capability yet (`NEON_ENABLED_PROVIDERS` is empty — see
 * neon-client.ts), so Google/Apple report `not-configured`; the launch-only dev
 * provider, exposed only under `__DEV__` and never shipped, is the working path
 * until #23 lands the https callback (ADR 0012).
 */
const authAdapter = createAuthAdapter({
  client: createNeonAuthClient(),
  enabled: NEON_ENABLED_PROVIDERS,
  includeDev: __DEV__,
});

/**
 * The real Launch State source: hydrates from Control Plane `GET /me` using the
 * Auth Adapter's User JWT (#23). With no Neon session `getUserJwt()` returns null
 * and the source yields signed-out without a network call — so under the dev
 * provider (no real session) and a blank base URL the app still boots cleanly to
 * the Identity Gate. The launch-only signed-in path arrives with real on-device
 * sign-in (#61). `fetch` is injected (the source stays RN-free and testable).
 */
const launchStateSource = createControlPlaneLaunchStateSource({
  baseUrl: process.env.EXPO_PUBLIC_CONTROL_PLANE_BASE_URL ?? "",
  getUserJwt: () => authAdapter.getUserJwt(),
  fetch: (url, init) => globalThis.fetch(url, init),
});

function RootNavigator(): React.JSX.Element {
  const { state } = useLaunchState();
  const route = routeForDestination(resolveLaunchState(state));
  const router = useRouter();

  // The launch decision (resolver + route mapping) is pure and tested in
  // route-for-destination.ts; the layout owns only the effect. A `splash` route
  // stays on the initial `index`; a `replace` route swaps to its zone. Replacing
  // to the current route is a no-op, so this is safe to run on every change.
  // `replace` (not `push`) so users can't back-navigate past the gate.
  const zone = route.kind === "replace" ? route.zone : null;
  useEffect(() => {
    if (zone !== null) router.replace(zone);
  }, [zone, router]);

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout(): React.JSX.Element {
  return (
    <LaunchStateProvider source={launchStateSource}>
      <AuthAdapterProvider adapter={authAdapter}>
        <RootNavigator />
      </AuthAdapterProvider>
    </LaunchStateProvider>
  );
}
