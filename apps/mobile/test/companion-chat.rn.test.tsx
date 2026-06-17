/**
 * RN tracer tests for the Intentive Chat Components wrapper (#33).
 *
 * These keep the UI assertions intentionally small: the deep behavior lives in
 * the pure Runtime Adapter tests. Here we prove the core external-store runtime
 * renders under jest-expo and that the composer sends through the injected
 * Runtime Adapter seam.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { CompanionChat } from "../src/domains/chat/ui/companion-chat";
import type {
  ConversationMessage,
  RuntimeAdapter,
  RuntimeAdapterState,
} from "../src/domains/chat/types/conversation";

const at = "2026-06-12T00:00:00.000Z";

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

test("typing and Send routes through the injected Runtime Adapter", async () => {
  const harness = createTestRuntimeAdapter();
  render(<CompanionChat adapter={harness.adapter} />);

  await typeAndSend("hello companion");

  await waitFor(() => expect(harness.sent).toEqual(["hello companion"]));
  expect(await screen.findByTestId("intentive-user-row")).toHaveTextContent("hello companion");
  expect(await screen.findByTestId("intentive-thinking")).toBeTruthy();
});

function createTestRuntimeAdapter(initialMessages: readonly ConversationMessage[] = []): {
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

function companionMessage(id: string, body: string): ConversationMessage {
  return {
    id,
    author: "companion",
    body,
    at,
    viaPostMessageBack: false,
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
