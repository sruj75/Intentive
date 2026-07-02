/**
 * RN test for the Grant Permissions step of the Onboarding funnel. omi-style:
 * Continue fires the injected notification permission ask and then advances —
 * always, whatever the OS prompt returns, and even if the ask throws. The ask is
 * injected (never imported from the notifications domain), so this test hands it
 * a fake and asserts it is called.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { GrantPermissionsStep } from "../src/domains/onboarding/ui/grant-permissions";

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function renderStep(deps: {
  requestNotificationPermission: () => Promise<unknown>;
  onNext: () => void;
}) {
  return render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <GrantPermissionsStep {...deps} />
    </SafeAreaProvider>,
  );
}

test("Continue fires the permission ask and then advances", async () => {
  const requestNotificationPermission = jest.fn(() => Promise.resolve("granted"));
  const onNext = jest.fn();
  renderStep({ requestNotificationPermission, onNext });

  fireEvent.press(screen.getByText("Continue"));

  await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
  expect(requestNotificationPermission).toHaveBeenCalledTimes(1);
});

test("advances even when the permission ask rejects", async () => {
  const requestNotificationPermission = jest.fn(() => Promise.reject(new Error("ask blew up")));
  const onNext = jest.fn();
  renderStep({ requestNotificationPermission, onNext });

  fireEvent.press(screen.getByText("Continue"));

  await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
});
