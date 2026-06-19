/**
 * RN tracer test for the Companion Chat route-entry composition (`src/entrypoints/`).
 *
 * ChatEntry is the one place the chat and account domains are composed together,
 * outside `src/domains/` so the cross-domain wiring stays lint-safe and the
 * `(chat)/` route stays navigation-only. The test injects the Runtime Adapter and
 * the Account State Source so it proves composition without any backend.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { ChatEntry } from "../src/entrypoints/chat-entry";
import type { AccountStateSource } from "../src/providers/account-state";
import { LaunchStateProvider, type LaunchStateSource } from "../src/providers/launch-state";
import type { RuntimeAdapter, RuntimeAdapterState } from "../src/domains/chat/types/conversation";

jest.mock("expo-glass-effect", () => {
  const { View } = require("react-native");
  return {
    GlassView: View,
    isLiquidGlassAvailable: () => false,
  };
});

const at = "2026-06-12T00:00:00.000Z";

const launchStateSource: LaunchStateSource = {
  read: () =>
    Promise.resolve({ signedIn: true, consent: "completed", siblingInvitation: "completed" }),
};

const accountStateSource: AccountStateSource = {
  read: async () => ({
    user_id: "u_1",
    next_gate: null,
    has_agent_instance: true,
    has_desktop_client: true,
  }),
};

function staticAdapter(overrides: Partial<RuntimeAdapterState> = {}): RuntimeAdapter {
  const state: RuntimeAdapterState = {
    messages: [
      { id: "opening", author: "companion", body: "I am here.", at, viaPostMessageBack: false },
    ],
    beforeCursor: null,
    agentState: "available",
    connectionState: "connected",
    error: null,
    ...overrides,
  };
  return {
    subscribe: () => () => {},
    getState: () => state,
    connect: async () => {},
    sendUserMessage: async () => {},
    retryUserMessage: async () => {},
    close: () => {},
  };
}

function renderChatEntry(adapter: RuntimeAdapter) {
  return render(
    <LaunchStateProvider source={launchStateSource}>
      <ChatEntry
        adapter={adapter}
        accountStateSource={accountStateSource}
        controlPlaneBaseUrl="https://cp.test"
      />
    </LaunchStateProvider>,
  );
}

test("Account Affordance opens the Account Surface, reflecting the adapter connection state", async () => {
  renderChatEntry(
    staticAdapter({ connectionState: "error", error: { kind: "network", message: "socket" } }),
  );

  expect(screen.queryByTestId("intentive-account-surface")).toBeNull();

  fireEvent.press(await screen.findByTestId("intentive-account-affordance"));

  expect(await screen.findByTestId("intentive-account-surface")).toBeTruthy();
  expect(screen.getByText("Connection issue")).toBeTruthy();
});

test("Mac setup banner clears after the Account Surface closes once Desktop Client is registered", async () => {
  let hasDesktopClient = false;
  const source: AccountStateSource = {
    read: jest.fn(async () => ({
      user_id: "u_1",
      next_gate: null,
      has_agent_instance: true,
      has_desktop_client: hasDesktopClient,
    })),
  };

  render(
    <LaunchStateProvider source={launchStateSource}>
      <ChatEntry
        adapter={staticAdapter()}
        accountStateSource={source}
        controlPlaneBaseUrl="https://cp.test"
      />
    </LaunchStateProvider>,
  );

  expect(await screen.findByText("Add Intentive on Mac for richer context")).toBeTruthy();

  // The user finishes Mac setup elsewhere; the next account read reports the Desktop Client.
  hasDesktopClient = true;
  fireEvent.press(screen.getByTestId("intentive-account-affordance"));
  fireEvent.press(screen.getByTestId("intentive-account-close"));

  await waitFor(() =>
    expect(screen.queryByText("Add Intentive on Mac for richer context")).toBeNull(),
  );
});

test("ChatEntry starts injected push registration on first chat entry mount", async () => {
  const pushRegistration = jest.fn(async () => {});

  render(
    <LaunchStateProvider source={launchStateSource}>
      <ChatEntry
        adapter={staticAdapter()}
        accountStateSource={accountStateSource}
        controlPlaneBaseUrl="https://cp.test"
        pushRegistration={pushRegistration}
      />
    </LaunchStateProvider>,
  );

  await waitFor(() => expect(pushRegistration).toHaveBeenCalledTimes(1));
});
