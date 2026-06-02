/**
 * RN harness-loop test: proves the reactive write path in the React runtime —
 * a gate stub's dev button writes its status into the shared store, and the
 * resolver re-evaluates to the next destination. (The router redirect itself is
 * verified by the simulator walk-through; here we assert the store↔resolver loop
 * that drives it.)
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

import { resolveLaunchState } from "../src/domains/onboarding/service/resolve-launch-state";
import { IdentityGateStub } from "../src/domains/auth/ui/identity-gate-stub";
import { ConsentPrimerStub } from "../src/domains/onboarding/ui/consent-primer-stub";
import { SiblingInvitationStub } from "../src/domains/onboarding/ui/sibling-invitation-stub";
import {
  LaunchStateProvider,
  useLaunchState,
  type LaunchStateSource,
} from "../src/providers/launch-state";

// Mirrors the dev harness source: signed-out with gates pre-populated so the
// whole walk works; the resolver's short-circuit hides gates until sign-in.
const walkSource: LaunchStateSource = {
  read: () =>
    Promise.resolve({ signedIn: false, consent: "pending", siblingInvitation: "pending" }),
};

function Destination() {
  const { state } = useLaunchState();
  return <Text testID="dest">{resolveLaunchState(state)}</Text>;
}

function renderHarness() {
  return render(
    <LaunchStateProvider source={walkSource}>
      <Destination />
      <IdentityGateStub />
      <ConsentPrimerStub />
      <SiblingInvitationStub />
    </LaunchStateProvider>,
  );
}

async function expectDestination(value: string) {
  await waitFor(() => expect(screen.getByTestId("dest")).toHaveTextContent(value));
}

test("walking the gates (skip path) drives the resolver to chat", async () => {
  renderHarness();
  await expectDestination("SIGNED_OUT");

  fireEvent.press(screen.getByText("Sign in (dev)"));
  await expectDestination("MISSING_CONSENT");

  fireEvent.press(screen.getByText("Accept consent (dev)"));
  await expectDestination("SIBLING_INVITATION_PENDING");

  fireEvent.press(screen.getByText("Skip for now (dev)"));
  await expectDestination("READY_FOR_CHAT");
});

test("completing (not skipping) the sibling invitation also reaches chat", async () => {
  renderHarness();
  await expectDestination("SIGNED_OUT");

  fireEvent.press(screen.getByText("Sign in (dev)"));
  fireEvent.press(screen.getByText("Accept consent (dev)"));
  await expectDestination("SIBLING_INVITATION_PENDING");

  fireEvent.press(screen.getByText("Complete setup (dev)"));
  await expectDestination("READY_FOR_CHAT");
});
