/**
 * RN test for the Identity Gate (#19): it renders continuity-framed sign-in,
 * advances the resolver off SIGNED_OUT on success via the `markSignedIn` seam,
 * and is capability-honest on the unhappy paths — silent on cancel, a
 * recoverable notice on error/not-configured, never a fake success.
 *
 * The Auth Adapter is injected as a controllable fake, so this never touches a
 * network or the Neon SDK.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import * as ReactNative from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthAdapterProvider } from "../src/domains/auth/ui/auth-context";
import { IdentityGate } from "../src/domains/auth/ui/identity-gate";
import type { AuthAdapter, SignInOutcome } from "../src/domains/auth/types/auth";
import { resolveLaunchState } from "../src/domains/onboarding/service/resolve-launch-state";
import {
  LaunchStateProvider,
  useLaunchState,
  type LaunchStateSource,
} from "../src/providers/launch-state";

const signedOutSource: LaunchStateSource = {
  read: () =>
    Promise.resolve({ signedIn: false, consent: "pending", siblingInvitation: "pending" }),
};

function Destination(): React.JSX.Element {
  const { state } = useLaunchState();
  return <Text testID="dest">{resolveLaunchState(state)}</Text>;
}

function fakeAdapter(signIn: (provider: string) => Promise<SignInOutcome>): AuthAdapter {
  return {
    signIn: signIn as AuthAdapter["signIn"],
    signOut: () => Promise.resolve(),
    restoreSession: () => Promise.resolve(false),
    getUserJwt: () => Promise.resolve(null),
  };
}

function renderGate(adapter: AuthAdapter) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, right: 0, bottom: 34, left: 0 },
      }}
    >
      <LaunchStateProvider source={signedOutSource}>
        <AuthAdapterProvider adapter={adapter}>
          <Destination />
          <IdentityGate />
        </AuthAdapterProvider>
      </LaunchStateProvider>
    </SafeAreaProvider>,
  );
}

afterEach(() => {
  jest.restoreAllMocks();
});

async function expectDestination(value: string) {
  await waitFor(() => expect(screen.getByTestId("dest")).toHaveTextContent(value));
}

test("renders continuity-framed copy and the sign-in options", async () => {
  renderGate(fakeAdapter(() => Promise.resolve({ status: "cancelled" })));
  await expectDestination("SIGNED_OUT");
  expect(screen.getByText("Continue with Google")).toBeTruthy();
  expect(screen.getByText("Continue with Apple")).toBeTruthy();
  // Copy explains continuity, not features.
  expect(screen.getByText(/remembers you/i)).toBeTruthy();
});

test("uses dark appearance tokens", async () => {
  jest.spyOn(ReactNative, "useColorScheme").mockReturnValue("dark");

  renderGate(fakeAdapter(() => Promise.resolve({ status: "cancelled" })));
  await expectDestination("SIGNED_OUT");

  expect(screen.getByText("Intentive")).toHaveStyle({ color: "#EEEBE6" });
  expect(screen.getByText(/remembers you/i)).toHaveStyle({ color: "#9C989F" });
});

test("successful sign-in advances the resolver off SIGNED_OUT", async () => {
  renderGate(fakeAdapter(() => Promise.resolve({ status: "signed-in" })));
  await expectDestination("SIGNED_OUT");
  fireEvent.press(screen.getByText("Continue with Google"));
  await expectDestination("MISSING_CONSENT");
});

test("cancelled sign-in is silent and stays on the gate", async () => {
  renderGate(fakeAdapter(() => Promise.resolve({ status: "cancelled" })));
  await expectDestination("SIGNED_OUT");
  fireEvent.press(screen.getByText("Continue with Google"));
  await waitFor(() => expect(screen.queryByTestId("auth-notice")).toBeNull());
  await expectDestination("SIGNED_OUT");
});

test("a recoverable error keeps the gate and shows a retry notice", async () => {
  renderGate(fakeAdapter(() => Promise.resolve({ status: "error", message: "boom" })));
  await expectDestination("SIGNED_OUT");
  fireEvent.press(screen.getByText("Continue with Google"));
  await waitFor(() => expect(screen.getByTestId("auth-notice")).toHaveTextContent(/try again/i));
  await expectDestination("SIGNED_OUT");
});

test("a thrown sign-in is handled as recoverable, not an unhandled rejection", async () => {
  renderGate(fakeAdapter(() => Promise.reject(new Error("network down"))));
  await expectDestination("SIGNED_OUT");
  fireEvent.press(screen.getByText("Continue with Google"));
  await waitFor(() => expect(screen.getByTestId("auth-notice")).toHaveTextContent(/try again/i));
  await expectDestination("SIGNED_OUT");
});

test("an unconfigured provider is surfaced honestly, not as a fake success", async () => {
  renderGate(fakeAdapter(() => Promise.resolve({ status: "not-configured" })));
  await expectDestination("SIGNED_OUT");
  fireEvent.press(screen.getByText("Continue with Apple"));
  await waitFor(() =>
    expect(screen.getByTestId("auth-notice")).toHaveTextContent(/isn't available yet/i),
  );
  await expectDestination("SIGNED_OUT");
});
