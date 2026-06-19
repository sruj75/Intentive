import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as ReactNative from "react-native";
import { Text } from "react-native";
import type { AccountState } from "@intentive/api-contract";

import { AccountSurface } from "../src/domains/account/ui/account-surface";
import { resolveLaunchState } from "../src/domains/onboarding/service/resolve-launch-state";
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

afterEach(() => {
  jest.restoreAllMocks();
});

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
  launchStateSource,
  controlPlaneBaseUrl = "https://cp.test",
  runtimeConnectionState = "connected",
  accountState,
  visible = true,
}: {
  onSignOut?: () => Promise<void>;
  launchState?: LaunchState;
  launchStateSource?: LaunchStateSource;
  controlPlaneBaseUrl?: string;
  runtimeConnectionState?: RuntimeConnectionState;
  accountState?: AccountState | null;
  visible?: boolean;
}) {
  const source: LaunchStateSource = launchStateSource ?? {
    read: () => Promise.resolve(launchState),
  };

  return (
    <LaunchStateProvider source={source}>
      <Destination />
      <SignInAgain />
      <AccountSurface
        accountState={accountState}
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
  accountState,
}: {
  onSignOut?: () => Promise<void>;
  launchState?: LaunchState;
  controlPlaneBaseUrl?: string;
  runtimeConnectionState?: RuntimeConnectionState;
  accountState?: AccountState | null;
} = {}) {
  return render(
    accountSurfaceTree({
      accountState,
      controlPlaneBaseUrl,
      launchState,
      onSignOut,
      runtimeConnectionState,
    }),
  );
}

test("Account Surface shows safe identity, support, and debug information", async () => {
  renderAccountSurface({
    accountState: {
      user_id: "u_123",
      next_gate: null,
      has_agent_instance: true,
      has_desktop_client: false,
    },
  });

  expect(await screen.findByText("u_123")).toBeTruthy();
  expect(screen.getByText("Support")).toBeTruthy();
  expect(screen.getByText("App debug")).toBeTruthy();
});

test("Account Surface uses dark appearance tokens", async () => {
  jest.spyOn(ReactNative, "useColorScheme").mockReturnValue("dark");

  renderAccountSurface();

  await waitFor(() => expect(screen.getByTestId("dest")).toHaveTextContent("READY_FOR_CHAT"));
  expect(screen.getByText("Account")).toHaveStyle({ color: "#EEEBE6" });
  expect(screen.getByText("Connection")).toHaveStyle({ color: "#EEEBE6" });
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

test("logout keeps completed gate progress as a fallback when re-login has no server state", async () => {
  const source: LaunchStateSource = {
    read: jest
      .fn()
      .mockResolvedValueOnce({
        signedIn: true,
        consent: "completed",
        siblingInvitation: "skipped",
      })
      .mockResolvedValueOnce({
        signedIn: false,
        consent: null,
        siblingInvitation: null,
      }),
  };

  render(accountSurfaceTree({ launchStateSource: source }));
  await waitFor(() => expect(screen.getByTestId("dest")).toHaveTextContent("READY_FOR_CHAT"));

  fireEvent.press(screen.getByText("Sign out"));
  await waitFor(() => expect(screen.getByTestId("dest")).toHaveTextContent("SIGNED_OUT"));

  fireEvent.press(screen.getByText("Sign in again"));

  await waitFor(() => expect(screen.getByTestId("dest")).toHaveTextContent("READY_FOR_CHAT"));
});

test("signing in as a different account reconciles gates instead of inheriting prior progress", async () => {
  const source: LaunchStateSource = {
    read: jest
      .fn()
      .mockResolvedValueOnce({
        signedIn: true,
        consent: "completed",
        siblingInvitation: "skipped",
      })
      .mockResolvedValueOnce({
        signedIn: true,
        consent: "pending",
        siblingInvitation: "pending",
      }),
  };

  render(accountSurfaceTree({ launchStateSource: source }));
  await waitFor(() => expect(screen.getByTestId("dest")).toHaveTextContent("READY_FOR_CHAT"));

  fireEvent.press(screen.getByText("Sign out"));
  await waitFor(() => expect(screen.getByTestId("dest")).toHaveTextContent("SIGNED_OUT"));

  fireEvent.press(screen.getByText("Sign in again"));

  await waitFor(() => expect(screen.getByTestId("dest")).toHaveTextContent("MISSING_CONSENT"));
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
