import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ChatEntry } from "../src/entrypoints/chat-entry";
import { OnboardingEntry } from "../src/entrypoints/onboarding-entry";
import { ProfileProvider } from "../src/providers/profile/profile-provider";
import { createProfileStore, type ProfileStore } from "../src/providers/profile/profile-store";

// The route files compose the real platform (native Neon client, telemetry);
// these boundary assertions drive the entrypoints' offline default path, which
// is the same navigation logic the routes mount.
const OnboardingRoute = <OnboardingEntry />;
const MainRoute = <ChatEntry />;

jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderRoute(route: React.ReactNode, store: ProfileStore = createProfileStore()) {
  return {
    store,
    screen: render(
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider initialMetrics={metrics}>
          <ProfileProvider store={store}>{route}</ProfileProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>,
    ),
  };
}

describe("Mobile Router boundaries", () => {
  beforeEach(() => jest.clearAllMocks());

  it("cold launch starts at A without replacing", () => {
    const { screen } = renderRoute(OnboardingRoute);
    expect(screen.getByTestId("continue-with-google")).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("replaces onboarding with /chat after D", () => {
    const { screen, store } = renderRoute(OnboardingRoute);
    fireEvent.press(screen.getByTestId("continue-with-google"));
    fireEvent.changeText(screen.getByTestId("full-name-input"), "Srujan Gowda");
    fireEvent.press(screen.getByTestId("submit-name"));
    fireEvent.press(screen.getByTestId("add-friends-intro"));
    fireEvent.press(screen.getByTestId("enable-permissions"));

    expect(store.getSnapshot().initials).toBe("SG");
    expect(router.replace).toHaveBeenCalledWith("/chat");
  });

  it("resets the profile and replaces logout with /", () => {
    const store = createProfileStore();
    store.setName("Srujan Gowda");
    const { screen } = renderRoute(MainRoute, store);
    fireEvent.press(screen.getByTestId("identity-control"));
    fireEvent.press(screen.getByTestId("open-settings"));
    fireEvent.press(screen.getByTestId("log-out"));

    expect(store.getSnapshot().fullName).toBe("");
    expect(router.replace).toHaveBeenCalledWith("/");
  });

  it("resets the profile only after an injected live logout succeeds", async () => {
    const store = createProfileStore();
    store.setName("Srujan Gowda");
    let finishLogout: (() => void) | undefined;
    const onLogout = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishLogout = resolve;
        }),
    );
    const { screen } = renderRoute(<ChatEntry onLogout={onLogout} />, store);
    fireEvent.press(screen.getByTestId("identity-control"));
    fireEvent.press(screen.getByTestId("open-settings"));
    fireEvent.press(screen.getByTestId("log-out"));

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().fullName).toBe("Srujan Gowda");

    await act(async () => finishLogout?.());
    await waitFor(() => expect(store.getSnapshot().fullName).toBe(""));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("preserves the profile when an injected live logout fails", async () => {
    const store = createProfileStore();
    store.setName("Srujan Gowda");
    const onLogout = jest.fn().mockRejectedValue(new Error("session persisted"));
    const { screen } = renderRoute(<ChatEntry onLogout={onLogout} />, store);
    fireEvent.press(screen.getByTestId("identity-control"));
    fireEvent.press(screen.getByTestId("open-settings"));

    await act(async () => {
      fireEvent.press(screen.getByTestId("log-out"));
    });

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().fullName).toBe("Srujan Gowda");
    expect(router.replace).not.toHaveBeenCalled();
  });
});
