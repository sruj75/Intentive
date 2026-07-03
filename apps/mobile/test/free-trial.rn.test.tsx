/**
 * RN test for the Free Trial gate — the full-screen paywall just before chat
 * (not the bottom-sheet shell). Its primary action writes `trial: "completed"` so
 * the resolver advances off MISSING_TRIAL to chat. There is no billing yet; the
 * button just advances (secondary actions are cosmetic no-ops).
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

test("renders the full-screen paywall with milestones, pricing, and a start action", async () => {
  renderTrial();
  await expectDestination("MISSING_TRIAL");
  // Full-screen paywall, not the OnboardingScreen bottom sheet.
  expect(screen.getByTestId("free-trial-paywall")).toBeTruthy();
  expect(screen.queryByTestId("onboarding-bottom-sheet")).toBeNull();
  expect(screen.getByTestId("onboarding-progress")).toHaveProp("accessibilityLabel", "Step 6 of 6");
  // Headline is split so "it's free!" can carry the accent emphasis.
  expect(screen.getByText(/Enjoy your first week/)).toBeTruthy();
  expect(screen.getByText("it's free!")).toBeTruthy();
  // Milestone timeline.
  expect(screen.getByText("Today")).toBeTruthy();
  expect(screen.getByText("Day 5")).toBeTruthy();
  expect(screen.getByText("Day 7")).toBeTruthy();
  // Pricing + primary CTA + store-style footer.
  expect(screen.getByText(/Unlimited access for 7 days/)).toBeTruthy();
  expect(screen.getByText("Start free trial")).toBeTruthy();
  expect(screen.getByText("View all plans")).toBeTruthy();
  expect(screen.getByText("Restore purchases")).toBeTruthy();
});

test("starting the trial advances the resolver to chat", async () => {
  renderTrial();
  await expectDestination("MISSING_TRIAL");
  fireEvent.press(screen.getByText("Start free trial"));
  await expectDestination("READY_FOR_CHAT");
});
