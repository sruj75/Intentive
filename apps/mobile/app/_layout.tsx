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
import {
  LaunchStateProvider,
  useLaunchState,
  type LaunchDestination,
  type LaunchStateSource,
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
 * Starts signed-out with the gates pre-populated so the whole gate walk works
 * with no network round-trip; the resolver's signed-out short-circuit hides the
 * gate values until the user signs in.
 */
const devSource: LaunchStateSource = {
  read: () =>
    Promise.resolve({ signedIn: false, consent: "pending", siblingInvitation: "pending" }),
};

const HREF_FOR: Record<Exclude<LaunchDestination, "RESOLVING">, string> = {
  SIGNED_OUT: "/(gates)/identity",
  MISSING_CONSENT: "/(gates)/consent",
  SIBLING_INVITATION_PENDING: "/(gates)/invite",
  READY_FOR_CHAT: "/(chat)",
};

function RootNavigator(): React.JSX.Element {
  const { state } = useLaunchState();
  const destination = resolveLaunchState(state);
  const router = useRouter();

  useEffect(() => {
    // RESOLVING stays on the splash (the initial `index` route); every other
    // destination redirects to its zone. Replacing to the current route is a
    // no-op, so this is safe to run on every destination change.
    if (destination !== "RESOLVING") {
      router.replace(HREF_FOR[destination]);
    }
  }, [destination, router]);

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
