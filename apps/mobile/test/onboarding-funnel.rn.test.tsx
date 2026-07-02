/**
 * RN test for the Onboarding Funnel — the one collapsed gate. It proves the
 * decomposition decision (ADR 0019): name → acquisition source → grant
 * permissions step forward with LOCAL state (the resolver stays on
 * MISSING_ONBOARDING the whole time), and only the last step completes the gate
 * — writing `onboarding: "completed"` so the resolver advances to the next gate.
 *
 * A real LaunchStateProvider drives the store↔resolver loop; the notification ask
 * is injected as a fake. Seeded signed-in + consent done + onboarding pending so
 * the funnel is the active gate; trial pre-done so the next stop is the sibling gate.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { OnboardingFunnel } from "../src/domains/onboarding/ui/onboarding-funnel";
import { resolveLaunchState } from "../src/domains/onboarding/service/resolve-launch-state";
import {
  LaunchStateProvider,
  useLaunchState,
  type LaunchStateSource,
} from "../src/providers/launch-state";

const needsOnboardingSource: LaunchStateSource = {
  read: () =>
    Promise.resolve({
      signedIn: true,
      consent: "completed",
      onboarding: "pending",
      siblingInvitation: "pending",
      trial: "completed",
    }),
};

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function Destination(): React.JSX.Element {
  const { state } = useLaunchState();
  return <Text testID="dest">{resolveLaunchState(state)}</Text>;
}

async function expectDestination(value: string) {
  await waitFor(() => expect(screen.getByTestId("dest")).toHaveTextContent(value));
}

test("walking name → source → permissions completes the one onboarding gate", async () => {
  const requestNotificationPermission = jest.fn(() => Promise.resolve("granted"));

  render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <LaunchStateProvider source={needsOnboardingSource}>
        <Destination />
        <OnboardingFunnel requestNotificationPermission={requestNotificationPermission} />
      </LaunchStateProvider>
    </SafeAreaProvider>,
  );

  // The resolver reports one gate across all three local steps.
  await expectDestination("MISSING_ONBOARDING");

  // Step 1: name.
  expect(screen.getByText("What's your name?")).toBeTruthy();
  fireEvent.changeText(screen.getByPlaceholderText("Enter your name"), "Ada");
  fireEvent.press(screen.getByText("Continue"));

  // Step 2: acquisition source — still the same gate.
  await waitFor(() => expect(screen.getByText("How did you find us?")).toBeTruthy());
  await expectDestination("MISSING_ONBOARDING");
  fireEvent.press(screen.getByText("Web search"));
  fireEvent.press(screen.getByText("Continue"));

  // Step 3: grant permissions — completing it finishes the gate.
  await waitFor(() => expect(screen.getByText("Stay in the loop")).toBeTruthy());
  fireEvent.press(screen.getByText("Continue"));

  await expectDestination("SIBLING_INVITATION_PENDING");
  expect(requestNotificationPermission).toHaveBeenCalledTimes(1);
});
