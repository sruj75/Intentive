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

function createThrowingAuthAdapter(error: Error): AuthAdapter {
  return {
    signIn: jest.fn().mockRejectedValue(error),
    signOut: jest.fn().mockResolvedValue(undefined),
    restoreSession: jest.fn().mockResolvedValue(false),
    getUserJwt: jest.fn().mockResolvedValue(null),
  };
}

function renderEntry(
  outcome: SignInOutcome,
  {
    authAdapter = createAuthAdapter(outcome),
    googleAuthConfigured = true,
  }: { authAdapter?: AuthAdapter; googleAuthConfigured?: boolean } = {},
) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ProfileProvider store={createProfileStore()}>
        <OnboardingEntry authAdapter={authAdapter} googleAuthConfigured={googleAuthConfigured} />
      </ProfileProvider>
    </SafeAreaProvider>,
  );
}

test("neither Apple nor dev sign-in controls are present at the Identity Gate", () => {
  const screen = renderEntry({ status: "signed-in" });
  expect(screen.queryByTestId("continue-with-apple")).toBeNull();
  expect(screen.queryByTestId("continue-with-dev")).toBeNull();
  expect(screen.getByTestId("continue-with-google")).toBeTruthy();
});

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
  // Cancellation is silent: no retry notice.
  expect(screen.queryByText(/try again/i)).toBeNull();
});

test("a recoverable failure shows an actionable retry notice and stays on the gate", async () => {
  const screen = renderEntry({ status: "error", message: "exchange failed" } as SignInOutcome);

  fireEvent.press(screen.getByTestId("continue-with-google"));

  await waitFor(() => expect(screen.queryByText(/try again/i)).toBeTruthy());
  expect(screen.getByTestId("continue-with-google")).toBeTruthy();
  expect(screen.queryByTestId("full-name-input")).toBeNull();
});

test("a thrown sign-in failure clears pending state and offers a retry", async () => {
  const authAdapter = createThrowingAuthAdapter(new Error("native Google failure"));
  const screen = renderEntry({ status: "error", message: "unused" }, { authAdapter });

  fireEvent.press(screen.getByTestId("continue-with-google"));

  await waitFor(() => expect(screen.getByText(/try again/i)).toBeTruthy());
  expect(screen.getByTestId("continue-with-google")).toBeEnabled();
  expect(screen.getByTestId("continue-with-google")).toHaveTextContent("Continue with Google");
  expect(screen.queryByTestId("full-name-input")).toBeNull();
});

test("a missing configuration disables the button and shows a not-configured notice", () => {
  const screen = renderEntry({ status: "not-configured" }, { googleAuthConfigured: false });
  expect(screen.getByText(/isn’t configured/i)).toBeTruthy();
  expect(screen.getByTestId("continue-with-google")).toBeDisabled();
});
