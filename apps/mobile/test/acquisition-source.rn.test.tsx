/**
 * RN test for the Acquisition Source ("How did you find us?") step of the
 * Onboarding funnel. The user picks one option, which enables Continue; Continue
 * advances via the injected `onNext`. It writes nothing to Launch State.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AcquisitionSourceStep } from "../src/domains/onboarding/ui/acquisition-source";

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function renderStep(onNext: () => void) {
  return render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <AcquisitionSourceStep onNext={onNext} />
    </SafeAreaProvider>,
  );
}

test("asks how the user found us and starts with Continue disabled", () => {
  renderStep(jest.fn());
  expect(screen.getByText("How did you find us?")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
});

test("picking an option enables Continue and advances the funnel", () => {
  const onNext = jest.fn();
  renderStep(onNext);

  fireEvent.press(screen.getByText("Continue"));
  expect(onNext).not.toHaveBeenCalled();

  fireEvent.press(screen.getByText("App Store"));
  fireEvent.press(screen.getByText("Continue"));
  expect(onNext).toHaveBeenCalledTimes(1);
});
