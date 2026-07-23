import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { createLocalConversationSession } from "../src/domains/chat/runtime/local-conversation-session";
import { ChatEntry } from "../src/entrypoints/chat-entry";
import type { AccountStateSource } from "../src/providers/account-state";
import { ProfileProvider } from "../src/providers/profile/profile-provider";
import { createProfileStore } from "../src/providers/profile/profile-store";

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const account = (hasAgentInstance: boolean) => ({
  user_id: "u_1",
  next_gate: null,
  has_agent_instance: hasAgentInstance,
  has_desktop_client: true,
});

test("education replay waits for refreshed Account State before returning ready", async () => {
  let resolveReplay: ((value: ReturnType<typeof account>) => void) | undefined;
  const read = jest
    .fn()
    .mockResolvedValueOnce(account(true))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveReplay = resolve;
        }),
    );
  const source: AccountStateSource = { read };
  const createSession = jest.fn(() => createLocalConversationSession());

  const screen = render(
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={metrics}>
        <ProfileProvider store={createProfileStore()}>
          <ChatEntry accountStateSource={source} createSession={createSession} />
        </ProfileProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>,
  );

  await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
  fireEvent.press(screen.getByTestId("get-started"));
  fireEvent.press(screen.getByTestId("skip-education"));
  expect(screen.getByTestId("chat-ready-state")).toBeTruthy();
  expect(screen.getByText("What can you do for me?")).toBeTruthy();

  fireEvent.press(screen.getByTestId("identity-control"));
  fireEvent.press(screen.getByTestId("open-settings"));
  fireEvent.press(screen.getByTestId("replay-education"));
  fireEvent.press(screen.getByTestId("skip-education"));

  expect(read).toHaveBeenCalledTimes(2);
  expect(screen.getByTestId("education-slide-1")).toBeTruthy();
  expect(screen.queryByTestId("chat-ready-state")).toBeNull();

  await act(async () => {
    resolveReplay?.(account(false));
  });

  await waitFor(() => expect(screen.getByTestId("chat-ready-state")).toBeTruthy());
  expect(screen.queryByText("What can you do for me?")).toBeNull();
  expect(createSession).toHaveBeenCalledTimes(2);
});
