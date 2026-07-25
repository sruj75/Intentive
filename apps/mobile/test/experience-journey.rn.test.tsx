import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { expoClient } from "@better-auth/expo/client";
import * as Sentry from "@sentry/react-native";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { createAuthClient } from "better-auth/client";
import { Dimensions } from "react-native";
import { useState } from "react";
import { GestureHandlerRootView, State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ChatEntry } from "../src/entrypoints/chat-entry";
import { OnboardingEntry } from "../src/entrypoints/onboarding-entry";
import { createLocalConversationSession } from "../src/domains/chat/runtime/local-conversation-session";
import { ProfileProvider } from "../src/providers/profile/profile-provider";
import { createProfileStore } from "../src/providers/profile/profile-store";

jest.mock("@better-auth/expo/client", () => ({ expoClient: jest.fn() }));
jest.mock("better-auth/client", () => ({ createAuthClient: jest.fn() }));
jest.mock("@sentry/react-native", () => ({ init: jest.fn(), captureException: jest.fn() }));
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock(
  "expo-contacts",
  () => ({ getContactsAsync: jest.fn(), requestPermissionsAsync: jest.fn() }),
  { virtual: true },
);
jest.mock(
  "@react-native-async-storage/async-storage",
  () => ({
    getItem: jest.fn(),
    setItem: jest.fn(),
    mergeItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  }),
  { virtual: true },
);

interface ContactBoundaryMock {
  readonly getContactsAsync: jest.Mock;
  readonly requestPermissionsAsync: jest.Mock;
}

interface DurableStorageMock {
  readonly getItem: jest.Mock;
  readonly setItem: jest.Mock;
  readonly mergeItem: jest.Mock;
  readonly removeItem: jest.Mock;
  readonly clear: jest.Mock;
}

const contacts = jest.requireMock("expo-contacts") as ContactBoundaryMock;
const durableStorage = jest.requireMock(
  "@react-native-async-storage/async-storage",
) as DurableStorageMock;

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const acceptedWindow = { width: 390, height: 844, scale: 3, fontScale: 1 };

const createTestSession = (firstName: string) =>
  createLocalConversationSession({
    firstName,
    delays: { thinkingMs: 40, composingMs: 220, replyMs: 500 },
  });

function JourneyHarness() {
  const [zone, setZone] = useState<"onboarding" | "main">("onboarding");
  return zone === "onboarding" ? (
    <OnboardingEntry onComplete={() => setZone("main")} />
  ) : (
    <ChatEntry createSession={createTestSession} onLogout={() => setZone("onboarding")} />
  );
}

function renderExperience() {
  const profile = createProfileStore();
  return render(
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={metrics}>
        <ProfileProvider store={profile}>
          <JourneyHarness />
        </ProfileProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>,
  );
}

function expectNoCapabilityCalls() {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  expect(globalThis.WebSocket).not.toHaveBeenCalled();
  expect(createAuthClient).not.toHaveBeenCalled();
  expect(expoClient).not.toHaveBeenCalled();
  expect(Sentry.init).not.toHaveBeenCalled();
  expect(Sentry.captureException).not.toHaveBeenCalled();
  expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  expect(contacts.getContactsAsync).not.toHaveBeenCalled();
  expect(contacts.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(durableStorage.getItem).not.toHaveBeenCalled();
  expect(durableStorage.setItem).not.toHaveBeenCalled();
  expect(durableStorage.mergeItem).not.toHaveBeenCalled();
  expect(durableStorage.removeItem).not.toHaveBeenCalled();
  expect(durableStorage.clear).not.toHaveBeenCalled();
}

describe("Huracán local experience", () => {
  const originalFetch = globalThis.fetch;
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    Dimensions.set({ window: acceptedWindow, screen: acceptedWindow });
    globalThis.fetch = jest.fn();
    globalThis.WebSocket = jest.fn() as unknown as typeof WebSocket;
  });

  afterEach(() => {
    jest.clearAllMocks();
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = originalWebSocket;
  });

  it("walks and captures A through L without native or backend calls", async () => {
    const screen = renderExperience();

    expect(screen.getByTestId("experience-app")).toHaveProp("edges", {
      top: "additive",
      right: "off",
      bottom: "additive",
      left: "off",
    });
    expect(screen.toJSON()).toMatchSnapshot("A-auth");

    // Google is the sole v1 production Auth Provider (ADR 0030): neither Apple
    // nor a dev control is present.
    expect(screen.queryByTestId("continue-with-apple")).toBeNull();
    expect(screen.queryByTestId("continue-with-dev")).toBeNull();

    fireEvent.press(screen.getByTestId("continue-with-google"));
    const nameInput = screen.getByTestId("full-name-input");
    expect(screen.toJSON()).toMatchSnapshot("B1-name");

    fireEvent.changeText(nameInput, "Srujan");
    fireEvent.press(screen.getByTestId("submit-name"));
    expect(screen.getByTestId("name-error")).toHaveTextContent("Enter your first and last name");
    expect(screen.toJSON()).toMatchSnapshot("B2-name-error");

    fireEvent.changeText(nameInput, "Srujan Gowda");
    fireEvent(nameInput, "submitEditing");
    expect(screen.getByText("Intentive Mentions")).toBeTruthy();
    expect(screen.toJSON()).toMatchSnapshot("C-friends-intro");

    fireEvent.press(screen.getByTestId("add-friends-intro"));
    expect(screen.getByText("Intentive is proactive.")).toBeTruthy();
    expect(screen.toJSON()).toMatchSnapshot("D-permissions-intro");

    fireEvent.press(screen.getByTestId("enable-permissions"));
    expect(screen.getByTestId("chat-welcome-state")).toBeTruthy();
    expect(screen.toJSON()).toMatchSnapshot("E-chat-welcome");

    fireEvent.press(screen.getByTestId("identity-control"));
    expect(screen.getByTestId("drawer-overlay")).toBeTruthy();
    expect(screen.getByText("Tasks")).toBeDisabled();
    expect(screen.getByText("Messages")).toBeDisabled();
    expect(screen.getByText("Friends")).toBeDisabled();
    expect(screen.toJSON()).toMatchSnapshot("F-drawer");

    const openSettings = screen.getByTestId("open-settings");
    expect(openSettings).toHaveProp("accessible", true);
    expect(openSettings).toHaveProp("accessibilityRole", "button");
    expect(openSettings.props.onAccessibilityTap).toEqual(expect.any(Function));
    fireEvent(openSettings, "accessibilityTap");
    expect(screen.getByTestId("settings-overlay")).toBeTruthy();
    fireEvent(screen.getByTestId("privacy-toggle"), "valueChange", false);
    fireEvent.changeText(screen.getByTestId("privacy-rule-input"), "Keep work private");
    expect(screen.getByDisplayValue("Keep work private")).toBeTruthy();
    expect(screen.toJSON()).toMatchSnapshot("G-settings");

    fireEvent.press(screen.getByTestId("settings-identity-control"));
    fireEvent.press(screen.getByText("Intentive"));
    expect(screen.queryByTestId("drawer-overlay")).toBeNull();

    fireEvent.press(screen.getByTestId("get-started"));
    for (let index = 1; index <= 5; index += 1) {
      expect(screen.getByTestId(`education-slide-${index}`)).toBeTruthy();
      expect(screen.toJSON()).toMatchSnapshot(`education-${index}`);
      if (index < 5) fireEvent.press(screen.getByTestId("education-continue"));
    }
    fireEvent.press(screen.getByTestId("education-continue"));

    expect(screen.getByTestId("chat-ready-state")).toBeTruthy();
    expect(screen.getByLabelText("Add attachment unavailable")).toBeDisabled();
    expect(screen.getByLabelText("Microphone unavailable")).toBeDisabled();
    expect(screen.getByText("Add Friends")).toBeDisabled();
    expect(screen.getByTestId("conversation-scroll")).toHaveProp(
      "contentInsetAdjustmentBehavior",
      "automatic",
    );
    expect(screen.toJSON()).toMatchSnapshot("K1-chat-ready");

    fireEvent.press(screen.getByText("What can you do for me?"));
    const composer = screen.getByTestId("composer-input");
    expect(composer).toHaveDisplayValue("What can you do for me?");
    expect(composer).toHaveProp("submitBehavior", "submit");
    fireEvent(composer, "focus");
    expect(composer).toBeEnabled();
    expect(screen.getByTestId("conversation-keyboard-avoiding")).toBeTruthy();
    expect(screen.getByTestId("conversation-scroll")).toHaveProp(
      "keyboardDismissMode",
      "interactive",
    );
    expect(screen.toJSON()).toMatchSnapshot("K2-composer-focused");

    fireEvent(composer, "submitEditing");
    expect(screen.getByText("What can you do for me?")).toBeTruthy();
    expect(screen.toJSON()).toMatchSnapshot("L1-user-sent");

    await waitFor(() => expect(screen.getByTestId("chat-thinking")).toBeTruthy());
    expect(screen.toJSON()).toMatchSnapshot("L2-thinking");
    await waitFor(() => expect(screen.getByTestId("chat-composing")).toBeTruthy());
    expect(screen.toJSON()).toMatchSnapshot("L3-composing");
    await waitFor(() => expect(screen.getByText(/Hey Srujan/)).toBeTruthy());
    expect(screen.toJSON()).toMatchSnapshot("L4-replied");

    expectNoCapabilityCalls();
  });

  it("supports gesture and background dismissal, replay, skip, and cold reset", async () => {
    const screen = renderExperience();
    fireEvent.press(screen.getByTestId("continue-with-google"));
    fireEvent.changeText(screen.getByTestId("full-name-input"), "Srujan Gowda");
    fireEvent.press(screen.getByTestId("submit-name"));
    fireEvent.press(screen.getByTestId("add-friends-intro"));
    fireEvent.press(screen.getByTestId("enable-permissions"));

    fireEvent.press(screen.getByTestId("identity-control"));
    fireEvent.press(screen.getByTestId("drawer-scrim"));
    expect(screen.queryByTestId("drawer-overlay")).toBeNull();

    fireEvent.press(screen.getByTestId("identity-control"));
    act(() => {
      fireGestureHandler(getByGestureTestId("drawer-pan"), [
        { state: State.BEGAN, translationX: 0 },
        { state: State.ACTIVE, translationX: -80 },
        { state: State.END, translationX: -80 },
      ]);
    });
    await waitFor(() => expect(screen.queryByTestId("drawer-overlay")).toBeNull());

    fireEvent.press(screen.getByTestId("get-started"));
    act(() => {
      fireGestureHandler(getByGestureTestId("education-pan"), [
        { state: State.BEGAN, translationX: 0 },
        { state: State.ACTIVE, translationX: -80 },
        { state: State.END, translationX: -80 },
      ]);
    });
    await waitFor(() => expect(screen.getByTestId("education-slide-2")).toBeTruthy());
    fireEvent.press(screen.getByTestId("skip-education"));

    fireEvent.changeText(screen.getByTestId("composer-input"), "Draft survives replay");
    fireEvent.press(screen.getByTestId("identity-control"));
    fireEvent.press(screen.getByTestId("open-settings"));
    fireEvent.press(screen.getByTestId("replay-education"));
    expect(screen.getByTestId("education-slide-1")).toBeTruthy();
    fireEvent.press(screen.getByTestId("skip-education"));
    expect(screen.getByTestId("composer-input")).toHaveDisplayValue("Draft survives replay");
    fireEvent(screen.getByTestId("composer-input"), "submitEditing");
    expect(screen.getByText("Draft survives replay")).toBeTruthy();
    fireEvent.press(screen.getByTestId("identity-control"));
    fireEvent.press(screen.getByTestId("open-settings"));
    fireEvent.press(screen.getByTestId("replay-education"));
    fireEvent.press(screen.getByTestId("skip-education"));
    expect(screen.queryByText("Draft survives replay")).toBeNull();
    fireEvent.press(screen.getByTestId("identity-control"));
    fireEvent.press(screen.getByTestId("open-settings"));
    fireEvent.press(screen.getByTestId("log-out"));

    expect(screen.getByTestId("continue-with-google")).toBeTruthy();
    expectNoCapabilityCalls();
  });

  it("reconstructs a fresh controller at A after a cold launch", () => {
    const firstLaunch = renderExperience();
    fireEvent.press(firstLaunch.getByTestId("continue-with-google"));
    fireEvent.changeText(firstLaunch.getByTestId("full-name-input"), "Srujan Gowda");
    fireEvent.press(firstLaunch.getByTestId("submit-name"));
    fireEvent.press(firstLaunch.getByTestId("add-friends-intro"));
    fireEvent.press(firstLaunch.getByTestId("enable-permissions"));
    fireEvent.press(firstLaunch.getByTestId("get-started"));
    fireEvent.press(firstLaunch.getByTestId("skip-education"));
    expect(firstLaunch.getByTestId("chat-ready-state")).toBeTruthy();
    firstLaunch.unmount();

    const coldLaunch = renderExperience();
    expect(coldLaunch.getByTestId("continue-with-google")).toBeTruthy();
    expect(coldLaunch.queryByTestId("chat-ready-state")).toBeNull();
    expectNoCapabilityCalls();
  });
});
