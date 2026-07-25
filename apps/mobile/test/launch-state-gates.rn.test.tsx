import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Pressable, Text, View } from "react-native";

import type { LaunchStateSource } from "../src/providers/launch-state/source";
import { LaunchStateProvider, useLaunchState } from "../src/providers/launch-state/store";
import type { LaunchState } from "../src/providers/launch-state/types";

const consentPending: LaunchState = {
  signedIn: true,
  consent: "pending",
  onboarding: "completed",
  siblingInvitation: "pending",
  trial: "completed",
};

const siblingPending: LaunchState = {
  ...consentPending,
  consent: "completed",
};

const ready: LaunchState = {
  ...siblingPending,
  siblingInvitation: "skipped",
};

function GateHarness() {
  const launch = useLaunchState();
  return (
    <View>
      <Text testID="gate-state">
        {launch.state.consent}:{launch.state.siblingInvitation}
      </Text>
      <Pressable
        onPress={() => void launch.acceptConsent().catch(() => undefined)}
        testID="persist-consent"
      />
      <Pressable
        onPress={() => void launch.completeOnboardingFunnel().catch(() => undefined)}
        testID="persist-sibling"
      />
    </View>
  );
}

test("durable gate writes reconcile server truth before Launch State advances", async () => {
  const reads = [consentPending, siblingPending, ready];
  const source: LaunchStateSource = {
    read: jest.fn(async () => reads.shift() ?? ready),
    acceptConsent: jest.fn().mockResolvedValue(undefined),
    skipSiblingInvitation: jest.fn().mockResolvedValue(undefined),
  };
  const screen = render(
    <LaunchStateProvider source={source}>
      <GateHarness />
    </LaunchStateProvider>,
  );

  await waitFor(() =>
    expect(screen.getByTestId("gate-state")).toHaveTextContent("pending:pending"),
  );
  fireEvent.press(screen.getByTestId("persist-consent"));
  expect(screen.getByTestId("gate-state")).toHaveTextContent("pending:pending");
  await waitFor(() =>
    expect(screen.getByTestId("gate-state")).toHaveTextContent("completed:pending"),
  );

  fireEvent.press(screen.getByTestId("persist-sibling"));
  expect(screen.getByTestId("gate-state")).toHaveTextContent("completed:pending");
  await waitFor(() =>
    expect(screen.getByTestId("gate-state")).toHaveTextContent("completed:skipped"),
  );
  expect(source.read).toHaveBeenCalledTimes(3);
});

test("a failed durable write leaves the outstanding gate pending", async () => {
  const source: LaunchStateSource = {
    read: jest.fn().mockResolvedValue(consentPending),
    acceptConsent: jest.fn().mockRejectedValue(new Error("offline")),
  };
  const screen = render(
    <LaunchStateProvider source={source}>
      <GateHarness />
    </LaunchStateProvider>,
  );

  await waitFor(() =>
    expect(screen.getByTestId("gate-state")).toHaveTextContent("pending:pending"),
  );
  fireEvent.press(screen.getByTestId("persist-consent"));
  await waitFor(() => expect(source.acceptConsent).toHaveBeenCalledTimes(1));
  expect(screen.getByTestId("gate-state")).toHaveTextContent("pending:pending");
  expect(source.read).toHaveBeenCalledTimes(1);
});

test("a successful POST cannot advance a gate that reconciliation still reports pending", async () => {
  const source: LaunchStateSource = {
    read: jest.fn().mockResolvedValue(consentPending),
    acceptConsent: jest.fn().mockResolvedValue(undefined),
  };
  const screen = render(
    <LaunchStateProvider source={source}>
      <GateHarness />
    </LaunchStateProvider>,
  );

  await waitFor(() =>
    expect(screen.getByTestId("gate-state")).toHaveTextContent("pending:pending"),
  );
  fireEvent.press(screen.getByTestId("persist-consent"));
  await waitFor(() => expect(source.read).toHaveBeenCalledTimes(2));
  expect(screen.getByTestId("gate-state")).toHaveTextContent("pending:pending");
});
