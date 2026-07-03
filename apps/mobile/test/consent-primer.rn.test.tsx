/**
 * RN test for the Consent Primer — the Data & Privacy screen. It renders the
 * data/processing disclosure with links to the Privacy Policy & Terms of Service
 * and a single affirmative CTA ("Agree & Continue"); on accept it writes
 * `consent: "completed"` so the resolver advances off MISSING_CONSENT.
 *
 * A real LaunchStateProvider drives the store↔resolver loop; the screen calls
 * the store's `setConsent` mutator directly — there is no consent service to
 * fake. Seeded signed-in + consent pending (with the funnel already done) so
 * consent is the active gate and accepting it advances to the next one.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Linking, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import {
  ConsentPrimer,
  PRIVACY_POLICY_URL,
  TERMS_OF_SERVICE_URL,
} from "../src/domains/onboarding/ui/consent-primer";
import { resolveLaunchState } from "../src/domains/onboarding/service/resolve-launch-state";
import {
  LaunchStateProvider,
  useLaunchState,
  type LaunchStateSource,
} from "../src/providers/launch-state";

const needsConsentSource: LaunchStateSource = {
  read: () =>
    Promise.resolve({
      signedIn: true,
      consent: "pending",
      onboarding: "completed",
      siblingInvitation: "pending",
      trial: "completed",
    }),
};

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function Destination(): React.JSX.Element {
  const { state } = useLaunchState();
  return <Text testID="dest">{resolveLaunchState(state)}</Text>;
}

function renderPrimer() {
  return render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <LaunchStateProvider source={needsConsentSource}>
        <Destination />
        <ConsentPrimer />
      </LaunchStateProvider>
    </SafeAreaProvider>,
  );
}

async function expectDestination(value: string) {
  await waitFor(() => expect(screen.getByTestId("dest")).toHaveTextContent(value));
}

beforeEach(() => {
  jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("renders the Data & Privacy disclosure, policy links, and Agree & Continue", async () => {
  renderPrimer();
  await expectDestination("MISSING_CONSENT");
  expect(screen.getByText("Data & Privacy")).toBeTruthy();
  expect(screen.getByText(/securely stored on our servers/i)).toBeTruthy();
  expect(screen.getByText("Privacy Policy")).toBeTruthy();
  expect(screen.getByText("Terms of Service")).toBeTruthy();
  expect(screen.getByText("Agree & Continue")).toBeTruthy();
});

test("Privacy Policy opens /privacy and Terms of Service opens /terms", async () => {
  renderPrimer();
  await expectDestination("MISSING_CONSENT");
  fireEvent.press(screen.getByText("Privacy Policy"));
  fireEvent.press(screen.getByText("Terms of Service"));
  expect(Linking.openURL).toHaveBeenCalledWith(PRIVACY_POLICY_URL);
  expect(Linking.openURL).toHaveBeenCalledWith(TERMS_OF_SERVICE_URL);
});

test("accepting advances the resolver off MISSING_CONSENT", async () => {
  renderPrimer();
  await expectDestination("MISSING_CONSENT");
  fireEvent.press(screen.getByText("Agree & Continue"));
  await expectDestination("SIBLING_INVITATION_PENDING");
});
