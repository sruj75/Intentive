/**
 * RN test for the Name step of the Onboarding funnel. It collects a display name
 * and advances via the injected `onNext` only once a name is entered; it writes
 * nothing to Launch State (the funnel's last step completes the gate). Continue
 * is disabled until the field is non-empty.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { NameStep } from "../src/domains/onboarding/ui/name";

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function renderStep(onNext: () => void) {
  return render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <NameStep onNext={onNext} />
    </SafeAreaProvider>,
  );
}

test("asks for a name and starts with Continue disabled", () => {
  renderStep(jest.fn());
  expect(screen.getByText("What's your name?")).toBeTruthy();
  const button = screen.getByRole("button", { name: "Continue" });
  expect(button).toBeDisabled();
});

test("entering a name enables Continue and advances the funnel", () => {
  const onNext = jest.fn();
  renderStep(onNext);

  fireEvent.press(screen.getByText("Continue"));
  expect(onNext).not.toHaveBeenCalled();

  fireEvent.changeText(screen.getByPlaceholderText("Enter your name"), "Ada");
  fireEvent.press(screen.getByText("Continue"));
  expect(onNext).toHaveBeenCalledTimes(1);
});
