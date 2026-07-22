import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { OnboardingEntry } from "../src/entrypoints/onboarding-entry";
import type { AuthAdapter, SignInOutcome } from "../src/domains/auth/types/auth";
import { ProfileProvider } from "../src/providers/profile/profile-provider";
import { createProfileStore } from "../src/providers/profile/profile-store";

function createAuthAdapter(outcome: SignInOutcome): AuthAdapter {
  return {
    signIn: jest.fn().mockResolvedValue(outcome),
    signOut: jest.fn().mockResolvedValue(undefined),
    restoreSession: jest.fn().mockResolvedValue(false),
    getUserJwt: jest.fn().mockResolvedValue(null),
  };
}

function renderEntry(outcome: SignInOutcome) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ProfileProvider store={createProfileStore()}>
        <OnboardingEntry authAdapter={createAuthAdapter(outcome)} />
      </ProfileProvider>
    </SafeAreaProvider>,
  );
}

test("Identity Gate advances only after the auth exchange reports a session", async () => {
  const screen = renderEntry({ status: "signed-in" });

  fireEvent.press(screen.getByTestId("continue-with-google"));

  await waitFor(() => expect(screen.getByTestId("full-name-input")).toBeTruthy());
  expect(screen.queryByTestId("continue-with-google")).toBeNull();
});

test("Identity Gate stays put when native auth is cancelled", async () => {
  const screen = renderEntry({ status: "cancelled" });

  fireEvent.press(screen.getByTestId("continue-with-google"));

  await waitFor(() => expect(screen.getByTestId("continue-with-google")).toBeTruthy());
  expect(screen.queryByTestId("full-name-input")).toBeNull();
});
