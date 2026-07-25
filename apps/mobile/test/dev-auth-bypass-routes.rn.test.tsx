import { render } from "@testing-library/react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import ChatRoute from "../app/(main)/chat";
import OnboardingRoute from "../app/(onboarding)/index";
import { createLocalConversationSession } from "../src/domains/chat/runtime/local-conversation-session";
import { ProfileProvider } from "../src/providers/profile/profile-provider";
import { createProfileStore } from "../src/providers/profile/profile-store";

const mockAuth = {
  signIn: jest.fn().mockResolvedValue({ status: "signed-in" }),
  signOut: jest.fn().mockResolvedValue(undefined),
  restoreSession: jest.fn().mockResolvedValue(false),
  getUserJwt: jest.fn().mockResolvedValue(null),
};
const mockLaunch = {
  state: {
    signedIn: false,
    consent: null,
    onboarding: null,
    siblingInvitation: null,
    trial: null,
  },
  markSignedIn: jest.fn(),
  markSignedOut: jest.fn(),
  acceptConsent: jest.fn(),
  completeOnboardingFunnel: jest.fn(),
};
const mockCreateRuntimeSession = jest.fn(() => createLocalConversationSession());
const mockAccountStateSource = {
  read: jest.fn().mockResolvedValue(null),
};
const mockPlatform = {
  config: {
    devAuthBypassEnabled: true,
    googleAuthConfigured: false,
  },
  auth: mockAuth,
  createRuntimeSession: mockCreateRuntimeSession,
  accountStateSource: mockAccountStateSource,
};

jest.mock("../src/entrypoints/platform", () => ({
  getPlatform: () => mockPlatform,
}));
jest.mock("../src/providers/launch-state", () => ({
  useLaunchState: () => mockLaunch,
}));

test("the development auth bypass mounts directly at the first post-auth screen", () => {
  const screen = render(
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        <ProfileProvider store={createProfileStore()}>
          <OnboardingRoute />
        </ProfileProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>,
  );

  expect(screen.getByTestId("full-name-input")).toBeTruthy();
  expect(screen.queryByTestId("continue-with-google")).toBeNull();
  expect(mockAuth.signIn).not.toHaveBeenCalled();
  expect(mockLaunch.markSignedIn).not.toHaveBeenCalled();
});

test("the development auth bypass mounts the post-auth route on local capabilities", () => {
  const profile = createProfileStore();
  profile.setName("Srujan Gowda");
  const screen = render(
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        <ProfileProvider store={profile}>
          <ChatRoute />
        </ProfileProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>,
  );

  expect(screen.getByTestId("chat-welcome-state")).toBeTruthy();
  expect(mockCreateRuntimeSession).not.toHaveBeenCalled();
  expect(mockAccountStateSource.read).not.toHaveBeenCalled();
});
