/**
 * RN test for the Consent Primer (#20): it renders trust-setting copy (memory,
 * follow-ups, user control) with a single affirmative CTA, and on accept writes
 * `consent: "completed"` so the resolver advances off MISSING_CONSENT.
 *
 * A real LaunchStateProvider drives the store↔resolver loop; the screen calls
 * the store's `setConsent` mutator directly — there is no consent service to
 * fake. Seeded signed-in + consent pending so the gate is the active one.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

import { ConsentPrimer } from "../src/domains/onboarding/ui/consent-primer";
import { resolveLaunchState } from "../src/domains/onboarding/service/resolve-launch-state";
import {
  LaunchStateProvider,
  useLaunchState,
  type LaunchStateSource,
} from "../src/providers/launch-state";

const needsConsentSource: LaunchStateSource = {
  read: () => Promise.resolve({ signedIn: true, consent: "pending", siblingInvitation: "pending" }),
};

function Destination(): React.JSX.Element {
  const { state } = useLaunchState();
  return <Text testID="dest">{resolveLaunchState(state)}</Text>;
}

function renderPrimer() {
  return render(
    <LaunchStateProvider source={needsConsentSource}>
      <Destination />
      <ConsentPrimer />
    </LaunchStateProvider>,
  );
}

async function expectDestination(value: string) {
  await waitFor(() => expect(screen.getByTestId("dest")).toHaveTextContent(value));
}

test("renders trust-setting copy and a single Continue CTA", async () => {
  renderPrimer();
  await expectDestination("MISSING_CONSENT");
  // The three trust points: memory, follow-ups, user control.
  expect(screen.getByText(/remembers your conversations/i)).toBeTruthy();
  expect(screen.getByText(/follow up/i)).toBeTruthy();
  expect(screen.getByText(/in control of what it keeps/i)).toBeTruthy();
  expect(screen.getByText("Continue")).toBeTruthy();
});

test("accepting consent advances the resolver off MISSING_CONSENT", async () => {
  renderPrimer();
  await expectDestination("MISSING_CONSENT");
  fireEvent.press(screen.getByText("Continue"));
  await expectDestination("SIBLING_INVITATION_PENDING");
});
