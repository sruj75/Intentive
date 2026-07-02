/**
 * RN test for the Get Started landing — the pre-auth first screen. It is not a
 * gate: it renders continuity-framed copy and its button steps forward LOCALLY
 * to the sign-in options via the injected `onContinue`. It writes nothing to
 * Launch State.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { GetStarted } from "../src/domains/auth/ui/get-started";

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function renderLanding(onContinue: () => void) {
  return render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <GetStarted onContinue={onContinue} />
    </SafeAreaProvider>,
  );
}

test("renders continuity-framed copy and a Get Started action", () => {
  renderLanding(jest.fn());
  expect(screen.getByText("Intentive")).toBeTruthy();
  expect(screen.getByText(/remembers your context/i)).toBeTruthy();
  expect(screen.getByText("Get Started")).toBeTruthy();
});

test("Get Started steps forward to sign-in", () => {
  const onContinue = jest.fn();
  renderLanding(onContinue);
  fireEvent.press(screen.getByText("Get Started"));
  expect(onContinue).toHaveBeenCalledTimes(1);
});
