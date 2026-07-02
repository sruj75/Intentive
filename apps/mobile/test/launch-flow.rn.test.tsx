/**
 * RN harness-loop test: proves the reactive write path in the React runtime —
 * each gate screen's action writes its status into the shared store, and the
 * resolver re-evaluates to the next destination. A `GateSwitch` renders exactly
 * the screen the resolver points at (mirroring the real root-layout replacement),
 * so the whole signed-out → chat walk runs through one screen at a time. (The
 * router replacement itself is verified by the simulator walk-through; here we
 * assert the store↔resolver loop that drives it.)
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { resolveLaunchState } from "../src/domains/onboarding/service/resolve-launch-state";
import { AuthAdapterProvider } from "../src/domains/auth/ui/auth-context";
import { IdentityGate } from "../src/domains/auth/ui/identity-gate";
import type { AuthAdapter } from "../src/domains/auth/types/auth";
import { ConsentPrimer } from "../src/domains/onboarding/ui/consent-primer";
import { OnboardingFunnel } from "../src/domains/onboarding/ui/onboarding-funnel";
import { SiblingInvitation } from "../src/domains/onboarding/ui/sibling-invitation";
import { FreeTrial } from "../src/domains/onboarding/ui/free-trial";
import {
  LaunchStateProvider,
  createControlPlaneLaunchStateSource,
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
  getUserJwt: () => Promise.resolve(null),
};

// The same walk-safe source the dev harness boots: signed-out with gates
// pre-seeded `pending` so the whole walk works; the resolver's short-circuit
// hides gates until sign-in. One definition, owned by the stub factory.
const walkSource: LaunchStateSource = createStubLaunchStateSource("signed-out");
const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function Destination() {
  const { state } = useLaunchState();
  return <Text testID="dest">{resolveLaunchState(state)}</Text>;
}

// Renders exactly the screen the resolver points at — the store↔resolver loop's
// single active screen, the same one the root layout would replace to.
function GateSwitch() {
  const { state } = useLaunchState();
  switch (resolveLaunchState(state)) {
    case "SIGNED_OUT":
      return <IdentityGate />;
    case "MISSING_CONSENT":
      return <ConsentPrimer />;
    case "MISSING_ONBOARDING":
      return <OnboardingFunnel requestNotificationPermission={() => Promise.resolve("granted")} />;
    case "SIBLING_INVITATION_PENDING":
      return <SiblingInvitation />;
    case "MISSING_TRIAL":
      return <FreeTrial />;
    case "READY_FOR_CHAT":
      return <Text>chat surface</Text>;
    default:
      return null; // RESOLVING → splash
  }
}

function renderWithSource(source: LaunchStateSource) {
  return render(
    <LaunchStateProvider source={source}>
      <Destination />
    </LaunchStateProvider>,
  );
}

function renderHarness(source: LaunchStateSource = walkSource) {
  return render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <LaunchStateProvider source={source}>
        <AuthAdapterProvider adapter={signInOkAdapter}>
          <Destination />
          <GateSwitch />
        </AuthAdapterProvider>
      </LaunchStateProvider>
    </SafeAreaProvider>,
  );
}

async function expectDestination(value: string) {
  await waitFor(() => expect(screen.getByTestId("dest")).toHaveTextContent(value));
}

// Walk the collapsed onboarding funnel (name → source → permissions).
async function walkOnboardingFunnel() {
  await waitFor(() => expect(screen.getByText("What's your name?")).toBeTruthy());
  fireEvent.changeText(screen.getByPlaceholderText("Enter your name"), "Ada");
  fireEvent.press(screen.getByText("Continue"));

  await waitFor(() => expect(screen.getByText("How did you find us?")).toBeTruthy());
  fireEvent.press(screen.getByText("App Store"));
  fireEvent.press(screen.getByText("Continue"));

  await waitFor(() => expect(screen.getByText("Stay in the loop")).toBeTruthy());
  fireEvent.press(screen.getByText("Continue"));
}

test("walking the gates (skip the Mac invite) drives the resolver to chat", async () => {
  renderHarness();
  await expectDestination("SIGNED_OUT");

  fireEvent.press(screen.getByText("Continue with Google"));
  await expectDestination("MISSING_CONSENT");

  fireEvent.press(screen.getByText("Agree & Continue"));
  await expectDestination("MISSING_ONBOARDING");

  await walkOnboardingFunnel();
  await expectDestination("SIBLING_INVITATION_PENDING");

  fireEvent.press(screen.getByText("Not now"));
  await expectDestination("MISSING_TRIAL");

  fireEvent.press(screen.getByText("Start free trial"));
  await expectDestination("READY_FOR_CHAT");
});

test("completing (not skipping) the Mac invite also reaches chat", async () => {
  renderHarness();
  await expectDestination("SIGNED_OUT");

  fireEvent.press(screen.getByText("Continue with Google"));
  await expectDestination("MISSING_CONSENT");

  fireEvent.press(screen.getByText("Agree & Continue"));
  await expectDestination("MISSING_ONBOARDING");

  await walkOnboardingFunnel();
  await expectDestination("SIBLING_INVITATION_PENDING");

  fireEvent.press(screen.getByText("Mark Mac connected (dev)"));
  await expectDestination("MISSING_TRIAL");

  fireEvent.press(screen.getByText("Start free trial"));
  await expectDestination("READY_FOR_CHAT");
});

test("signing in after a failed hydration still walks forward (never stranded on splash)", async () => {
  // Regression: the hydration-failure fallback leaves the gates unknown. An
  // optimistic sign-in must still hand the resolver concrete gate values, or the
  // user is stranded on RESOLVING with no re-read. markSignedIn owns that invariant.
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  const failingSource: LaunchStateSource = {
    read: () => Promise.reject(new Error("GET /me unavailable")),
  };

  try {
    renderHarness(failingSource);
    await expectDestination("SIGNED_OUT");

    fireEvent.press(screen.getByText("Continue with Google"));
    await expectDestination("MISSING_CONSENT");
  } finally {
    warn.mockRestore();
  }
});

test("the real Control Plane source boots to signed-out when there is no session", async () => {
  // The #23 production wiring: no Neon session → getUserJwt null → signed-out,
  // with no Control Plane call. This is what boots under the dev provider today.
  const source = createControlPlaneLaunchStateSource({
    baseUrl: "https://cp.test",
    getUserJwt: () => Promise.resolve(null),
    fetch: () => Promise.reject(new Error("must not be called without a session")),
  });

  renderWithSource(source);
  await expectDestination("SIGNED_OUT");
});

test("the real Control Plane source hydrates a signed-in user through to chat", async () => {
  // Real source → store → resolver, in the React runtime: a valid /me with no
  // pending gate lands the user in chat (the funnel + trial pass through until
  // the Control Plane can report them).
  const source = createControlPlaneLaunchStateSource({
    baseUrl: "https://cp.test",
    getUserJwt: () => Promise.resolve("jwt-123"),
    fetch: () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            user_id: "u_1",
            next_gate: null,
            has_agent_instance: false,
            has_desktop_client: false,
          }),
      }),
  });

  renderWithSource(source);
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
