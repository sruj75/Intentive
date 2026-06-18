import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

import { AccountSurface } from "../src/domains/account/ui/account-surface";
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

function SignInAgain() {
  const { markSignedIn } = useLaunchState();
  return <Text onPress={markSignedIn}>Sign in again</Text>;
}

function accountSurfaceTree({
  onSignOut = () => Promise.resolve(),
  launchState = { signedIn: true, consent: "completed", siblingInvitation: "completed" },
  controlPlaneBaseUrl = "https://cp.test",
  runtimeConnectionState = "connected",
  accountStateSource,
  visible = true,
}: {
  onSignOut?: () => Promise<void>;
  launchState?: LaunchState;
  controlPlaneBaseUrl?: string;
  runtimeConnectionState?: RuntimeConnectionState;
  accountStateSource?: AccountStateSource;
  visible?: boolean;
}) {
  const source: LaunchStateSource = { read: () => Promise.resolve(launchState) };

  return (
    <LaunchStateProvider source={source}>
      <Destination />
      <SignInAgain />
      <AccountSurface
        accountStateSource={accountStateSource}
        controlPlaneBaseUrl={controlPlaneBaseUrl}
        onSignOut={onSignOut}
        runtimeConnectionState={runtimeConnectionState}
        visible={visible}
        onClose={() => {}}
      />
    </LaunchStateProvider>
  );
}

function renderAccountSurface({
  onSignOut = () => Promise.resolve(),
  launchState = { signedIn: true, consent: "completed", siblingInvitation: "completed" },
  controlPlaneBaseUrl = "https://cp.test",
  runtimeConnectionState = "connected",
  accountStateSource,
}: {
  onSignOut?: () => Promise<void>;
  launchState?: LaunchState;
  controlPlaneBaseUrl?: string;
  runtimeConnectionState?: RuntimeConnectionState;
  accountStateSource?: AccountStateSource;
} = {}) {
  return render(
    accountSurfaceTree({
      accountStateSource,
      controlPlaneBaseUrl,
      launchState,
      onSignOut,
      runtimeConnectionState,
    }),
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

test("logout calls the injected sign-out command and returns Launch State to signed out", async () => {
  let signedOut = false;
  const onSignOut = async () => {
    signedOut = true;
  };

  renderAccountSurface({ onSignOut });
  await waitFor(() => expect(screen.getByTestId("dest")).toHaveTextContent("READY_FOR_CHAT"));

  fireEvent.press(screen.getByText("Sign out"));

  await waitFor(() => expect(signedOut).toBe(true));
  await waitFor(() => expect(screen.getByTestId("dest")).toHaveTextContent("SIGNED_OUT"));
});

test("logout keeps completed gate progress available for same-session re-login", async () => {
  renderAccountSurface({
    launchState: { signedIn: true, consent: "completed", siblingInvitation: "skipped" },
  });
  await waitFor(() => expect(screen.getByTestId("dest")).toHaveTextContent("READY_FOR_CHAT"));

  fireEvent.press(screen.getByText("Sign out"));
  await waitFor(() => expect(screen.getByTestId("dest")).toHaveTextContent("SIGNED_OUT"));

  fireEvent.press(screen.getByText("Sign in again"));

  await waitFor(() => expect(screen.getByTestId("dest")).toHaveTextContent("READY_FOR_CHAT"));
});

test("reopening Account Surface clears stale identity before the next account read resolves", async () => {
  let resolveSecondRead:
    | ((account: { user_id: string; next_gate: null; has_agent_instance: boolean }) => void)
    | null = null;
  const accountStateSource: AccountStateSource = {
    read: jest
      .fn()
      .mockResolvedValueOnce({ user_id: "u_123", next_gate: null, has_agent_instance: true })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecondRead = resolve;
          }),
      ),
  };

  const view = render(accountSurfaceTree({ accountStateSource, visible: true }));
  expect(await screen.findByText("u_123")).toBeTruthy();

  view.rerender(accountSurfaceTree({ accountStateSource, visible: false }));
  view.rerender(accountSurfaceTree({ accountStateSource, visible: true }));

  expect(screen.queryByText("u_123")).toBeNull();

  resolveSecondRead?.({ user_id: "u_456", next_gate: null, has_agent_instance: true });
  expect(await screen.findByText("u_456")).toBeTruthy();
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
