/**
 * Root layout — composition root for the navigation axis. This is the one place
 * allowed to wire providers to a domain service (it is not under `src/` and is
 * not lint-checked). It owns the single reactive redirect: it reads the shared
 * Launch State, runs the resolver, and replaces to the matching route zone
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
  createStubLaunchStateSource,
  useLaunchState,
} from "../src/providers/launch-state";

/**
 * The single real Auth Adapter, built once from the Neon client. No social
 * provider is a working capability yet (`NEON_ENABLED_PROVIDERS` is empty — see
 * neon-client.ts), so Google/Apple report `not-configured`; the launch-only dev
 * provider, exposed only under `__DEV__` and never shipped, is the working path
 * until #23 lands the https redirect (ADR 0012).
 */
const authAdapter = createAuthAdapter({
  client: createNeonAuthClient(),
  enabled: NEON_ENABLED_PROVIDERS,
  includeDev: __DEV__,
});

/**
 * DEV harness source — replaced in #23 by a `GET /me`-backed LaunchStateSource.
 * The `signed-out` scenario starts signed-out with the gates pre-seeded `pending`
 * (walk-safe, see source.ts) so the whole gate walk works with no network
 * round-trip; the resolver's signed-out short-circuit hides the gate values until
 * the user signs in. One definition of every bootable Launch State lives in the
 * stub factory — never an inline literal that can drift.
 */
const devSource = createStubLaunchStateSource("signed-out");

function RootNavigator(): React.JSX.Element {
  const { state } = useLaunchState();
  const route = routeForDestination(resolveLaunchState(state));
  const router = useRouter();

  // The launch decision (resolver + route mapping) is pure and tested in
  // route-for-destination.ts; the layout owns only the effect. A `splash` route
  // stays on the initial `index`; a `redirect` replaces to its zone. Replacing
  // to the current route is a no-op, so this is safe to run on every change.
  // `replace` (not `push`) so users can't back-navigate past the gate.
  const target = route.kind === "redirect" ? route.href : null;
  useEffect(() => {
    if (target !== null) router.replace(target);
  }, [target, router]);

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout(): React.JSX.Element {
  return (
    <LaunchStateProvider source={devSource}>
      <AuthAdapterProvider adapter={authAdapter}>
        <RootNavigator />
      </AuthAdapterProvider>
    </LaunchStateProvider>
  );
}
