import { fireEvent, render } from "@testing-library/react-native";

import { ConversationScene } from "../src/domains/chat/ui/conversation-scene";
import type {
  ConversationSession,
  ConversationSessionSnapshot,
} from "../src/domains/chat/types/conversation-timeline";

function createSession(snapshot: ConversationSessionSnapshot): {
  readonly session: ConversationSession;
  readonly retryConnection: jest.Mock;
  readonly retryUserMessage: jest.Mock;
} {
  const retryConnection = jest.fn();
  const retryUserMessage = jest.fn();
  return {
    retryConnection,
    retryUserMessage,
    session: {
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
      send: jest.fn(),
      retryConnection,
      retryUserMessage,
      dispose: jest.fn(),
    },
  };
}

function renderScene(session: ConversationSession) {
  return render(
    <ConversationScene
      composerValue=""
      firstName=""
      initials=""
      mode="ready"
      onBeginEducation={() => undefined}
      onComposerChange={() => undefined}
      onLogout={() => undefined}
      onReplayEducation={() => undefined}
      proactiveSuggestions
      renderSettings={() => null}
      session={session}
    />,
  );
}

test("failed outbound messages expose delivery failure and retry", () => {
  const harness = createSession({
    phase: "user_sent",
    connectionState: "error",
    error: { kind: "network", message: "Companion Chat connection failed." },
    timeline: [{ id: "user-1", kind: "user_message", text: "Hello", delivery: "failed" }],
  });
  const screen = renderScene(harness.session);

  expect(screen.getByTestId("message-user-1-failed")).toHaveTextContent("Not sent");
  fireEvent.press(screen.getByTestId("message-user-1-retry"));
  expect(harness.retryUserMessage).toHaveBeenCalledWith("user-1");
});

test("recoverable connection failures expose retry and disable the composer", () => {
  const harness = createSession({
    phase: "idle",
    connectionState: "error",
    error: { kind: "routing-unavailable", message: "Chat is temporarily unavailable." },
    timeline: [],
  });
  const screen = renderScene(harness.session);

  expect(screen.getByText("Chat is temporarily unavailable.")).toBeTruthy();
  expect(screen.getByTestId("composer-input").props.editable).toBe(false);
  fireEvent.press(screen.getByTestId("chat-retry-connection"));
  expect(harness.retryConnection).toHaveBeenCalledTimes(1);
});

test("reauth and gate failures explain the action without offering a futile retry", () => {
  const harness = createSession({
    phase: "idle",
    connectionState: "error",
    error: { kind: "reauth-required", message: "Sign in again to reconnect Companion Chat." },
    timeline: [],
  });
  const screen = renderScene(harness.session);

  expect(screen.getByText("Sign in again to reconnect Companion Chat.")).toBeTruthy();
  expect(screen.queryByTestId("chat-retry-connection")).toBeNull();
});
