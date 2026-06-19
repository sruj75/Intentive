/**
 * RN tracer tests for the Intentive Chat Components wrapper (#33).
 *
 * These keep the UI assertions intentionally small: the deep behavior lives in
 * the pure Runtime Adapter tests. Here we prove the core external-store runtime
 * renders under jest-expo and that the composer sends through the injected
 * Runtime Adapter seam.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as ReactNative from "react-native";
import { processColor, StyleSheet } from "react-native";

import { CompanionChat } from "../src/domains/chat/ui/companion-chat";
import type {
  ConversationMessage,
  RuntimeAdapter,
  RuntimeAdapterState,
} from "../src/domains/chat/types/conversation";

jest.mock("expo-glass-effect", () => {
  const { View } = require("react-native");
  return {
    GlassView: View,
    isLiquidGlassAvailable: () => false,
  };
});

const at = "2026-06-12T00:00:00.000Z";

afterEach(() => {
  jest.restoreAllMocks();
});

async function flushStore() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

async function typeAndSend(text: string) {
  fireEvent.changeText(screen.getByTestId("intentive-composer-input"), text);
  await flushStore();
  fireEvent.press(screen.getByTestId("intentive-composer-send"));
}

test("renders the Intentive-owned composer, not vendor example chrome", () => {
  render(<CompanionChat adapter={createTestRuntimeAdapter().adapter} />);
  expect(screen.getByTestId("intentive-composer-input")).toBeTruthy();
  expect(screen.getByTestId("intentive-composer-send")).toBeTruthy();
});

test("empty timeline renders Protected Opening composer state without sending draft", async () => {
  const harness = createTestRuntimeAdapter();
  render(<CompanionChat adapter={harness.adapter} />);

  expect(await screen.findByTestId("intentive-opening-pending")).toBeTruthy();

  fireEvent.changeText(screen.getByTestId("intentive-composer-input"), "I can draft early");
  await flushStore();
  fireEvent.press(screen.getByTestId("intentive-composer-send"));

  expect(harness.sent).toEqual([]);
  expect(screen.getByTestId("intentive-composer-input")).toHaveProp("value", "I can draft early");
  expect(await screen.findByText("Waiting for the Companion to start.")).toBeTruthy();
});

test("failed Protected Opening shows inline recovery and retries without clearing draft", async () => {
  const harness = createTestRuntimeAdapter([], {
    connectionState: "error",
    error: { kind: "network", message: "socket closed" },
  });
  render(<CompanionChat adapter={harness.adapter} />);

  fireEvent.changeText(screen.getByTestId("intentive-composer-input"), "please keep me");
  await flushStore();
  expect(await screen.findByTestId("intentive-opening-failed")).toBeTruthy();
  expect(await screen.findByText("I couldn't start the conversation.")).toBeTruthy();

  fireEvent.press(screen.getByTestId("intentive-opening-retry"));

  await waitFor(() => expect(harness.connectCount()).toBe(2));
  expect(harness.sent).toEqual([]);
  expect(screen.getByTestId("intentive-composer-input")).toHaveProp("value", "please keep me");
});

test("seeded messages render in Intentive-owned rows through the external-store runtime", async () => {
  const { adapter, connectCount } = createTestRuntimeAdapter([
    companionMessage("c1", "Welcome from server truth."),
    userMessage("u1", "hello companion", "confirmed"),
  ]);

  render(<CompanionChat adapter={adapter} />);

  expect(await screen.findByTestId("intentive-assistant-row")).toHaveTextContent(
    "Welcome from server truth.",
  );
  expect(await screen.findByTestId("intentive-user-row")).toHaveTextContent("hello companion");
  expect(connectCount()).toBe(1);
});

test("Companion Chat uses dark appearance tokens", async () => {
  jest.spyOn(ReactNative, "useColorScheme").mockReturnValue("dark");

  render(
    <CompanionChat
      adapter={
        createTestRuntimeAdapter([
          companionMessage("opening", "I am here."),
          userMessage("u1", "hello companion", "confirmed"),
        ]).adapter
      }
    />,
  );

  const assistantRowStyle = StyleSheet.flatten(
    (await screen.findByTestId("intentive-assistant-row")).props.style,
  );
  const userRowStyle = StyleSheet.flatten(
    (await screen.findByTestId("intentive-user-row")).props.style,
  );
  const inputStyle = StyleSheet.flatten(screen.getByTestId("intentive-composer-input").props.style);
  const composerFallbackStyle = StyleSheet.flatten(
    screen.getByTestId("intentive-composer-floating").props.style,
  );

  expect(assistantRowStyle.backgroundColor).toBe("#1F1E22");
  expect(assistantRowStyle.boxShadow).toBe("0 8px 24px rgba(0, 0, 0, 0.32)");
  expect(userRowStyle.boxShadow).toBe("0 8px 18px rgba(0, 0, 0, 0.28)");
  expect(composerFallbackStyle.backgroundColor).toBe("#28262C");
  expect(inputStyle.color).toBe("#EEEBE6");
  expect(screen.getByTestId("intentive-composer-send-icon")).toHaveProp(
    "tintColor",
    processColor("#EEEBE6"),
  );
});

test("typing and Send routes through the injected Runtime Adapter", async () => {
  const harness = createTestRuntimeAdapter([companionMessage("opening", "I am here.")]);
  render(<CompanionChat adapter={harness.adapter} />);

  await typeAndSend("hello companion");

  await waitFor(() => expect(harness.sent).toEqual(["hello companion"]));
  expect(await screen.findByTestId("intentive-user-row")).toHaveTextContent("hello companion");
  expect(await screen.findByTestId("intentive-thinking")).toBeTruthy();
});

test("Agent State chip renders the current honest state", async () => {
  render(
    <CompanionChat
      adapter={
        createTestRuntimeAdapter([companionMessage("opening", "I am here.")], {
          agentState: "following_up",
        }).adapter
      }
    />,
  );

  expect(await screen.findByTestId("intentive-agent-state")).toHaveTextContent("Following up");
});

test("Paused Agent State renders only from explicit override", async () => {
  render(
    <CompanionChat
      adapter={createTestRuntimeAdapter([companionMessage("opening", "I am here.")]).adapter}
      agentStateOverride="paused"
    />,
  );

  expect(await screen.findByTestId("intentive-agent-state")).toHaveTextContent("Paused");
});

test("Post-Message-Back messages render a lightweight continuity cue", async () => {
  render(
    <CompanionChat
      adapter={
        createTestRuntimeAdapter([
          companionMessage("opening", "I am here."),
          companionMessage("follow-up", "Checking in.", true),
        ]).adapter
      }
    />,
  );

  expect(await screen.findByText("Follow-up from your Companion")).toBeTruthy();
});

test("continuity cue clears notched-device top chrome", async () => {
  render(
    <CompanionChat
      adapter={
        createTestRuntimeAdapter([
          companionMessage("opening", "I am here."),
          companionMessage("follow-up", "Checking in.", true),
        ]).adapter
      }
      initialSafeAreaMetrics={safeAreaMetrics({ top: 59 })}
    />,
  );

  const chromeStyle = StyleSheet.flatten(screen.getByTestId("intentive-top-chrome").props.style);
  const continuityStyle = StyleSheet.flatten(
    screen.getByTestId("intentive-continuity-dock").props.style,
  );

  expect(continuityStyle.top).toBeGreaterThan(chromeStyle.top + 42);
});

test("continuity cue clears after newer conversation activity", async () => {
  render(
    <CompanionChat
      adapter={
        createTestRuntimeAdapter([
          companionMessage("opening", "I am here."),
          companionMessage("follow-up", "Checking in.", true),
          userMessage("reply", "Thanks.", "confirmed"),
        ]).adapter
      }
    />,
  );

  await flushStore();
  expect(screen.queryByText("Follow-up from your Companion")).toBeNull();
});

test("Mac setup banner appears from AccountState without blocking composer send", async () => {
  const harness = createTestRuntimeAdapter([companionMessage("opening", "I am here.")]);
  const openAccount = jest.fn();
  render(
    <CompanionChat
      adapter={harness.adapter}
      accountState={account(false)}
      onOpenAccount={openAccount}
    />,
  );

  expect(await screen.findByText("Add Intentive on Mac for richer context")).toBeTruthy();

  await typeAndSend("still works");

  await waitFor(() => expect(harness.sent).toEqual(["still works"]));
  fireEvent.press(screen.getByTestId("intentive-mac-setup-banner"));
  expect(openAccount).toHaveBeenCalledTimes(1);
});

test("Mac setup banner suppresses for registered Desktop Client and current-session dismiss", async () => {
  const visible = render(
    <CompanionChat
      adapter={createTestRuntimeAdapter([companionMessage("opening", "I am here.")]).adapter}
      accountState={account(false)}
    />,
  );

  expect(await screen.findByText("Add Intentive on Mac for richer context")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Dismiss Mac setup"));
  expect(screen.queryByText("Add Intentive on Mac for richer context")).toBeNull();

  visible.unmount();
  render(
    <CompanionChat
      adapter={createTestRuntimeAdapter([companionMessage("opening", "I am here.")]).adapter}
      accountState={account(true)}
    />,
  );

  await flushStore();
  expect(screen.queryByText("Add Intentive on Mac for richer context")).toBeNull();
});

test("Account Affordance is quiet, icon-only, and accessible", () => {
  render(<CompanionChat adapter={createTestRuntimeAdapter().adapter} />);

  const affordance = screen.getByLabelText("Open account");
  expect(affordance).toBeTruthy();
  expect(affordance).toHaveProp("accessibilityRole", "button");
});

test("Account Affordance opens the injected Account Surface", () => {
  const openAccount = jest.fn();
  render(
    <CompanionChat adapter={createTestRuntimeAdapter().adapter} onOpenAccount={openAccount} />,
  );

  fireEvent.press(screen.getByTestId("intentive-account-affordance"));

  expect(openAccount).toHaveBeenCalledTimes(1);
});

test("Composer floats above the bottom and the message list keeps space for it", () => {
  render(
    <CompanionChat
      adapter={createTestRuntimeAdapter([companionMessage("opening", "hi")]).adapter}
    />,
  );

  expect(screen.getByTestId("intentive-composer-dock")).toHaveStyle({
    bottom: 0,
    position: "absolute",
  });

  const listStyle = StyleSheet.flatten(
    screen.getByTestId("intentive-message-list").props.contentContainerStyle,
  );
  expect(listStyle.paddingBottom).toBeGreaterThan(0);
});

test("Composer draft input is multiline with a capped height", () => {
  render(
    <CompanionChat
      adapter={createTestRuntimeAdapter([companionMessage("opening", "hi")]).adapter}
    />,
  );

  const input = screen.getByTestId("intentive-composer-input");
  const inputStyle = StyleSheet.flatten(input.props.style);

  expect(input).toHaveProp("multiline", true);
  expect(inputStyle.maxHeight).toBeGreaterThan(inputStyle.minHeight);
});

function createTestRuntimeAdapter(
  initialMessages: readonly ConversationMessage[] = [],
  initialState: Partial<RuntimeAdapterState> = {},
): {
  adapter: RuntimeAdapter;
  sent: string[];
  connectCount(): number;
} {
  let state: RuntimeAdapterState = {
    messages: initialMessages,
    beforeCursor: null,
    agentState: "available",
    connectionState: "connected",
    error: null,
    ...initialState,
  };
  const listeners = new Set<() => void>();
  const sent: string[] = [];
  let connects = 0;

  const notify = () => {
    for (const listener of listeners) listener();
  };

  return {
    sent,
    adapter: {
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getState: () => state,
      connect: async () => {
        connects += 1;
      },
      sendUserMessage: async (body) => {
        sent.push(body);
        state = {
          ...state,
          agentState: "thinking",
          messages: [...state.messages, userMessage(`u${sent.length}`, body, "pending")],
        };
        notify();
      },
      retryUserMessage: async () => {},
      close: () => {},
    },
    connectCount: () => connects,
  };
}

function companionMessage(
  id: string,
  body: string,
  viaPostMessageBack = false,
): ConversationMessage {
  return {
    id,
    author: "companion",
    body,
    at,
    viaPostMessageBack,
  };
}

function userMessage(
  id: string,
  body: string,
  delivery: ConversationMessage["delivery"],
): ConversationMessage {
  return {
    id,
    author: "user",
    body,
    at,
    viaPostMessageBack: false,
    delivery,
  };
}

function account(hasDesktopClient: boolean) {
  return {
    user_id: "u_1",
    next_gate: null,
    has_agent_instance: true,
    has_desktop_client: hasDesktopClient,
  };
}

function safeAreaMetrics(insets: { top?: number; right?: number; bottom?: number; left?: number }) {
  return {
    frame: { x: 0, y: 0, width: 390, height: 844 },
    insets: {
      top: insets.top ?? 0,
      right: insets.right ?? 0,
      bottom: insets.bottom ?? 0,
      left: insets.left ?? 0,
    },
  };
}
