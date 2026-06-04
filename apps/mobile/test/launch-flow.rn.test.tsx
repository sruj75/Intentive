/**
 * RN harness-loop test: proves the reactive write path in the React runtime —
 * a gate screen's dev control writes its status into the shared store, and the
 * resolver re-evaluates to the next destination. (The router redirect itself is
 * verified by the simulator walk-through; here we assert the store↔resolver loop
 * that drives it.)
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

import { resolveLaunchState } from "../src/domains/onboarding/service/resolve-launch-state";
import { AuthAdapterProvider } from "../src/domains/auth/ui/auth-context";
import { IdentityGate } from "../src/domains/auth/ui/identity-gate";
import type { AuthAdapter } from "../src/domains/auth/types/auth";
import { ConsentPrimer } from "../src/domains/onboarding/ui/consent-primer";
import { SiblingInvitation } from "../src/domains/onboarding/ui/sibling-invitation";
import {
  LaunchStateProvider,
  createStubLaunchStateSource,
  useLaunchState,
  type LaunchStateSource,
} from "../src/providers/launch-state";

// A fake adapter that always signs in — keeps this test about the gate-walk
// store↔resolver loop, not the auth boundary (covered by identity-gate.rn.test).
const signInOkAdapter: AuthAdapter = {
  signIn: () => Promise.resolve({ status: "signed-in" }),
  signOut: () => Promise.resolve(),
  restoreSession: () => Promise.resolve(false),
  getAccessToken: () => Promise.resolve(null),
};

// The same walk-safe source the dev harness boots: signed-out with gates
// pre-seeded `pending` so the whole walk works; the resolver's short-circuit
// hides gates until sign-in. One definition, owned by the stub factory.
const walkSource: LaunchStateSource = createStubLaunchStateSource("signed-out");

function Destination() {
  const { state } = useLaunchState();
  return <Text testID="dest">{resolveLaunchState(state)}</Text>;
}

function renderWithSource(source: LaunchStateSource) {
  return render(
    <LaunchStateProvider source={source}>
      <Destination />
    </LaunchStateProvider>,
  );
}

function renderHarness() {
  return render(
    <LaunchStateProvider source={walkSource}>
      <AuthAdapterProvider adapter={signInOkAdapter}>
        <Destination />
        <IdentityGate />
        <ConsentPrimer />
        <SiblingInvitation />
      </AuthAdapterProvider>
    </LaunchStateProvider>,
  );
}

async function expectDestination(value: string) {
  await waitFor(() => expect(screen.getByTestId("dest")).toHaveTextContent(value));
}

test("walking the gates (skip path) drives the resolver to chat", async () => {
  renderHarness();
  await expectDestination("SIGNED_OUT");

  fireEvent.press(screen.getByText("Continue with Google"));
  await expectDestination("MISSING_CONSENT");

  fireEvent.press(screen.getByText("Continue"));
  await expectDestination("SIBLING_INVITATION_PENDING");

  fireEvent.press(screen.getByText("Not now"));
  await expectDestination("READY_FOR_CHAT");
});

test("completing (not skipping) the sibling invitation also reaches chat", async () => {
  renderHarness();
  await expectDestination("SIGNED_OUT");

  fireEvent.press(screen.getByText("Continue with Google"));
  fireEvent.press(screen.getByText("Continue"));
  await expectDestination("SIBLING_INVITATION_PENDING");

  fireEvent.press(screen.getByText("Mark Mac connected (dev)"));
  await expectDestination("READY_FOR_CHAT");
});

test("failed source hydration falls back to signed out instead of staying resolving", async () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const failingSource: LaunchStateSource = {
    read: () => Promise.reject(new Error("GET /me unavailable")),
  };

  try {
    renderWithSource(failingSource);
    await expectDestination("SIGNED_OUT");
    expect(warn).toHaveBeenCalledWith(
      "Launch State hydration failed; using signed-out fallback.",
      expect.any(Error),
    );
  } finally {
    warn.mockRestore();
  }
});
