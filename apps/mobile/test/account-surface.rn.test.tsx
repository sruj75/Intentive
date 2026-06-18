import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

import { AccountSurface } from "../src/domains/account/ui/account-surface";
import type { AuthAdapter } from "../src/domains/auth/types/auth";
import { resolveLaunchState } from "../src/domains/onboarding/service/resolve-launch-state";
import type { AccountStateSource } from "../src/providers/account-state";
import {
  LaunchStateProvider,
  useLaunchState,
  type LaunchState,
  type LaunchStateSource,
} from "../src/providers/launch-state";

type RuntimeConnectionState =
  | "idle"
  | "routing"
  | "connecting"
  | "connected"
  | "retrying"
  | "error";

function Destination() {
  const { state } = useLaunchState();
  return <Text testID="dest">{resolveLaunchState(state)}</Text>;
}

function renderAccountSurface({
  authAdapter = createAuthAdapter(),
  launchState = { signedIn: true, consent: "completed", siblingInvitation: "completed" },
  controlPlaneBaseUrl = "https://cp.test",
  runtimeConnectionState = "connected",
  accountStateSource,
}: {
  authAdapter?: AuthAdapter;
  launchState?: LaunchState;
  controlPlaneBaseUrl?: string;
  runtimeConnectionState?: RuntimeConnectionState;
  accountStateSource?: AccountStateSource;
} = {}) {
  const source: LaunchStateSource = { read: () => Promise.resolve(launchState) };

  return render(
    <LaunchStateProvider source={source}>
      <Destination />
      <AccountSurface
        accountStateSource={accountStateSource}
        authAdapter={authAdapter}
        controlPlaneBaseUrl={controlPlaneBaseUrl}
        runtimeConnectionState={runtimeConnectionState}
        visible
        onClose={() => {}}
      />
    </LaunchStateProvider>,
  );
}

test("Account Surface shows safe identity, support, and debug information", async () => {
  renderAccountSurface({
    accountStateSource: {
      read: () => Promise.resolve({ user_id: "u_123", next_gate: null, has_agent_instance: true }),
    },
  });

  expect(await screen.findByText("u_123")).toBeTruthy();
  expect(screen.getByText("Support")).toBeTruthy();
  expect(screen.getByText("App debug")).toBeTruthy();
});

test("logout calls the Auth Adapter and returns Launch State to signed out", async () => {
  let signedOut = false;
  const authAdapter = createAuthAdapter({
    signOut: async () => {
      signedOut = true;
    },
  });

  renderAccountSurface({ authAdapter });
  await waitFor(() => expect(screen.getByTestId("dest")).toHaveTextContent("READY_FOR_CHAT"));

  fireEvent.press(screen.getByText("Sign out"));

  await waitFor(() => expect(signedOut).toBe(true));
  await waitFor(() => expect(screen.getByTestId("dest")).toHaveTextContent("SIGNED_OUT"));
});

test("manual Mac setup guidance does not revive a skipped launch gate", async () => {
  renderAccountSurface({
    launchState: { signedIn: true, consent: "completed", siblingInvitation: "skipped" },
  });
  await waitFor(() => expect(screen.getByTestId("dest")).toHaveTextContent("READY_FOR_CHAT"));

  fireEvent.press(screen.getByText("Set up Mac"));

  expect(
    await screen.findByText("Install Intentive on your Mac and sign in with the same account."),
  ).toBeTruthy();
  expect(screen.getByTestId("dest")).toHaveTextContent("READY_FOR_CHAT");
});

test("Connection Status is one coarse user-facing state", async () => {
  renderAccountSurface({ runtimeConnectionState: "error" });
  await waitFor(() => expect(screen.getByTestId("dest")).toHaveTextContent("READY_FOR_CHAT"));

  expect(screen.getByText("Connection issue")).toBeTruthy();
  expect(screen.queryByText("socket status")).toBeNull();
});

test("blank Control Plane base URL shows not configured", async () => {
  renderAccountSurface({ controlPlaneBaseUrl: "" });
  await waitFor(() => expect(screen.getByTestId("dest")).toHaveTextContent("READY_FOR_CHAT"));

  expect(screen.getByText("Not configured")).toBeTruthy();
});

function createAuthAdapter(overrides: Partial<AuthAdapter> = {}): AuthAdapter {
  return {
    signIn: () => Promise.resolve({ status: "signed-in" }),
    signOut: () => Promise.resolve(),
    restoreSession: () => Promise.resolve(true),
    getUserJwt: () => Promise.resolve("jwt-123"),
    ...overrides,
  };
}
