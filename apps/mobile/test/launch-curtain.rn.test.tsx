import { render, waitFor } from "@testing-library/react-native";

import { LaunchCurtain } from "../src/entrypoints/launch-curtain";
import { LaunchStateProvider } from "../src/providers/launch-state/store";
import type { LaunchStateSource } from "../src/providers/launch-state/source";
import type { LaunchState } from "../src/providers/launch-state/types";

// `usePathname` needs the expo-router navigation context; the curtain's contract
// only depends on the resolved *string*, so we inject a controllable pathname via
// the global (jest.mock factories cannot reference out-of-scope variables).
jest.mock("expo-router", () => ({
  usePathname: () => (global as { __INTENTIVE_PATHNAME__?: string }).__INTENTIVE_PATHNAME__ ?? "/",
  router: { replace: jest.fn() },
}));

function setPathname(pathname: string): void {
  (global as { __INTENTIVE_PATHNAME__?: string }).__INTENTIVE_PATHNAME__ = pathname;
}

function setReduceMotion(value: boolean): void {
  (global as { __INTENTIVE_REDUCE_MOTION__?: boolean }).__INTENTIVE_REDUCE_MOTION__ = value;
}

function stubSource(state: LaunchState): LaunchStateSource {
  return { read: async () => ({ ...state }) };
}

const pendingSource: LaunchStateSource = {
  read: () => new Promise<LaunchState>(() => undefined),
};

function renderCurtain(source: LaunchStateSource) {
  return render(
    <LaunchStateProvider source={source}>
      <LaunchCurtain />
    </LaunchStateProvider>,
  );
}

afterEach(() => {
  (global as { __INTENTIVE_PATHNAME__?: string }).__INTENTIVE_PATHNAME__ = undefined;
  (global as { __INTENTIVE_REDUCE_MOTION__?: boolean }).__INTENTIVE_REDUCE_MOTION__ = undefined;
});

const signedOut: LaunchState = {
  signedIn: false,
  consent: "pending",
  onboarding: "pending",
  siblingInvitation: "pending",
  trial: "pending",
};
const readyForChat: LaunchState = {
  signedIn: true,
  consent: "completed",
  onboarding: "completed",
  siblingInvitation: "completed",
  trial: "completed",
};

test("the curtain stays through RESOLVING (hydration unknown)", async () => {
  setPathname("/");
  setReduceMotion(false);
  const screen = renderCurtain(pendingSource);
  const curtain = screen.getByLabelText("Loading Intentive");
  expect(curtain).toBeTruthy();
  expect(curtain).toHaveProp("pointerEvents", "auto");
  expect(screen.getByTestId("launch-icon")).toHaveProp(
    "source",
    require("../assets/brand-head.png"),
  );
  expect(screen.queryByLabelText("Intentive abstract mark")).toBeNull();
});

test("the curtain disappears only once hydration resolves AND pathname reaches the target", async () => {
  // Returning user resolves to READY_FOR_CHAT → target /chat. The Router has not
  // replaced yet (pathname still /), so the curtain stays to hide the flash.
  setPathname("/");
  setReduceMotion(false);
  const source = stubSource(readyForChat);
  const screen = renderCurtain(source);
  await waitFor(() => expect(screen.getByLabelText("Loading Intentive")).toBeTruthy());

  // The Router now reports the resolved /chat pathname; the curtain is removed.
  setPathname("/chat");
  screen.rerender(
    <LaunchStateProvider source={source}>
      <LaunchCurtain />
    </LaunchStateProvider>,
  );
  await waitFor(() => expect(screen.queryByLabelText("Loading Intentive")).toBeNull());
});

test("a signed-out launch removes the curtain as soon as it resolves (no Identity Gate flash)", async () => {
  setPathname("/");
  setReduceMotion(false);
  const screen = renderCurtain(stubSource(signedOut));
  // SIGNED_OUT → target /; pathname already /, so no flash: curtain drops on hydrate.
  await waitFor(() => expect(screen.queryByLabelText("Loading Intentive")).toBeNull());
});

test("under Reduce Motion the curtain shows the icon statically (no animation clock)", async () => {
  setPathname("/");
  setReduceMotion(true);
  const screen = renderCurtain(pendingSource);
  expect(screen.getByLabelText("Loading Intentive")).toBeTruthy();
  expect(screen.getByTestId("launch-icon")).toBeTruthy();
});
