/**
 * RN test for the signed-out zone's route composition (`app/(gates)/identity`):
 * the Get Started landing steps forward LOCALLY to the sign-in options, and a
 * returned signed-out user always lands back on Get Started first. The
 * launch-flow harness renders `IdentityGate` directly, so this locks in the
 * two-step Get Started → sign-in composition the route owns.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import IdentityRoute from "../app/(gates)/identity";
import { AuthAdapterProvider } from "../src/domains/auth/ui/auth-context";
import type { AuthAdapter } from "../src/domains/auth/types/auth";
import {
  LaunchStateProvider,
  createStubLaunchStateSource,
  useLaunchState,
} from "../src/providers/launch-state";

const signInOkAdapter: AuthAdapter = {
  signIn: () => Promise.resolve({ status: "signed-in" }),
  signOut: () => Promise.resolve(),
  restoreSession: () => Promise.resolve(false),
  getUserJwt: () => Promise.resolve(null),
};

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

// Drives the shared store the way the real Auth Adapter / Account logout do,
// while the route stays mounted — the mount-persistence scenario the router can
// produce when it replaces back to the same signed-out zone.
function SessionControls() {
  const { markSignedIn, markSignedOut } = useLaunchState();
  return (
    <>
      <Pressable onPress={markSignedIn}>
        <Text>dev-sign-in</Text>
      </Pressable>
      <Pressable onPress={markSignedOut}>
        <Text>dev-sign-out</Text>
      </Pressable>
    </>
  );
}

function renderRoute() {
  return render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <LaunchStateProvider source={createStubLaunchStateSource("signed-out")}>
        <AuthAdapterProvider adapter={signInOkAdapter}>
          <IdentityRoute />
          <SessionControls />
        </AuthAdapterProvider>
      </LaunchStateProvider>
    </SafeAreaProvider>,
  );
}

test("Get Started steps forward to the sign-in options in-place", async () => {
  renderRoute();
  await waitFor(() => expect(screen.getByText("Get Started")).toBeTruthy());

  fireEvent.press(screen.getByText("Get Started"));
  expect(screen.getByText("Sign in with Google")).toBeTruthy();
});

test("a returned signed-out user lands on Get Started, not the sign-in step", async () => {
  renderRoute();
  await waitFor(() => expect(screen.getByText("Get Started")).toBeTruthy());

  // Step forward to sign-in, then walk a full session out: sign in (route would
  // be replaced away, but stays mounted here) and sign back out.
  fireEvent.press(screen.getByText("Get Started"));
  expect(screen.getByText("Sign in with Google")).toBeTruthy();

  fireEvent.press(screen.getByText("dev-sign-in"));
  await waitFor(() => expect(screen.getByText("dev-sign-out")).toBeTruthy());
  fireEvent.press(screen.getByText("dev-sign-out"));

  // Back on the landing — the local sign-in step must have reset.
  await waitFor(() => expect(screen.getByText("Get Started")).toBeTruthy());
  expect(screen.queryByText("Sign in with Google")).toBeNull();
});
