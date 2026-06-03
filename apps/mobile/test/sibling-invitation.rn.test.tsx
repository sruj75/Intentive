/**
 * RN test for the Sibling Client Invitation (#21): a skippable, capability-honest
 * invitation to set up the Desktop Client. It renders what connecting the Mac
 * improves plus a plain pointer to where to get it, and on "Not now" writes
 * `siblingInvitation: "skipped"` so the resolver advances off
 * SIBLING_INVITATION_PENDING to READY_FOR_CHAT.
 *
 * A real LaunchStateProvider drives the store↔resolver loop; the screen calls
 * the store's `setSiblingInvitation` mutator directly — there is no pairing
 * service to fake, and the phone never claims the Mac connected. Seeded
 * signed-in + consent done + invitation pending so the gate is the active one.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

import { SiblingInvitation } from "../src/domains/onboarding/ui/sibling-invitation";
import { resolveLaunchState } from "../src/domains/onboarding/service/resolve-launch-state";
import {
  LaunchStateProvider,
  useLaunchState,
  type LaunchStateSource,
} from "../src/providers/launch-state";

const needsInviteSource: LaunchStateSource = {
  read: () =>
    Promise.resolve({ signedIn: true, consent: "completed", siblingInvitation: "pending" }),
};

function Destination(): React.JSX.Element {
  const { state } = useLaunchState();
  return <Text testID="dest">{resolveLaunchState(state)}</Text>;
}

function renderInvitation() {
  return render(
    <LaunchStateProvider source={needsInviteSource}>
      <Destination />
      <SiblingInvitation />
    </LaunchStateProvider>,
  );
}

async function expectDestination(value: string) {
  await waitFor(() => expect(screen.getByTestId("dest")).toHaveTextContent(value));
}

test("renders capability-honest Mac-setup guidance and a Not now action", async () => {
  renderInvitation();
  await expectDestination("SIBLING_INVITATION_PENDING");
  // What connecting the Mac improves — stated as future/conditional, never as
  // an already-connected capability.
  expect(screen.getByText(/when Intentive runs on your Mac/i)).toBeTruthy();
  expect(screen.getByText(/check-ins and nudges/i)).toBeTruthy();
  // A plain pointer to where to get it (no link/QR/pairing).
  expect(screen.getByText(/Download Intentive for Mac/i)).toBeTruthy();
  expect(screen.getByText("Not now")).toBeTruthy();
});

test("tapping Not now skips the gate and advances the resolver to chat", async () => {
  renderInvitation();
  await expectDestination("SIBLING_INVITATION_PENDING");
  fireEvent.press(screen.getByText("Not now"));
  await expectDestination("READY_FOR_CHAT");
});
