/**
 * RN test for the Free Trial gate — the cosmetic entitlement screen just before
 * chat. Its single action writes `trial: "completed"` so the resolver advances
 * off MISSING_TRIAL to chat. There is no billing yet; the button just advances.
 *
 * A real LaunchStateProvider drives the store↔resolver loop. Seeded so every
 * earlier gate is done and the trial is the last one pending.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { FreeTrial } from "../src/domains/onboarding/ui/free-trial";
import { resolveLaunchState } from "../src/domains/onboarding/service/resolve-launch-state";
import {
  LaunchStateProvider,
  useLaunchState,
  type LaunchStateSource,
} from "../src/providers/launch-state";

const needsTrialSource: LaunchStateSource = {
  read: () =>
    Promise.resolve({
      signedIn: true,
      consent: "completed",
      onboarding: "completed",
      siblingInvitation: "completed",
      trial: "pending",
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

function renderTrial() {
  return render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <LaunchStateProvider source={needsTrialSource}>
        <Destination />
        <FreeTrial />
      </LaunchStateProvider>
    </SafeAreaProvider>,
  );
}

async function expectDestination(value: string) {
  await waitFor(() => expect(screen.getByTestId("dest")).toHaveTextContent(value));
}

test("renders the trial offer with a single start action", async () => {
  renderTrial();
  await expectDestination("MISSING_TRIAL");
  expect(screen.getByText("Try Intentive free")).toBeTruthy();
  expect(screen.getByText("Start free trial")).toBeTruthy();
});

test("starting the trial advances the resolver to chat", async () => {
  renderTrial();
  await expectDestination("MISSING_TRIAL");
  fireEvent.press(screen.getByText("Start free trial"));
  await expectDestination("READY_FOR_CHAT");
});
