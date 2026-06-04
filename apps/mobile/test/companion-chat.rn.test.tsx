/**
 * RN spike tests for the Intentive Chat Components wrapper (#22).
 *
 * These exercise the wrapper through its rendered output — the dev adapter is
 * the system boundary (canned, deterministic, no network), so nothing internal
 * is mocked. They prove the ADR 0009 exit criteria: vendor visuals are fully
 * overridable, the composer slot is replaceable, the adapter slot is wired, and
 * loading/error/retry are surfaceable through local components.
 *
 * Plain placeholder visuals only — Liquid Glass is #45; Protocol is #33.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ChatModelAdapter } from "@assistant-ui/react-native";

import { CompanionChat } from "../src/domains/chat/ui/companion-chat";
import { createDevChatAdapter } from "../src/domains/chat/runtime/dev-chat-adapter";

// The assistant-ui store notifies React on a macrotask tick, so after typing we
// flush a timer before the composer's `canSend` reflects the text — otherwise a
// synchronous press sees empty text and no-ops. Standard async-UI test hygiene.
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
  render(<CompanionChat />);
  expect(screen.getByTestId("intentive-composer-input")).toBeTruthy();
  expect(screen.getByTestId("intentive-composer-send")).toBeTruthy();
});

test("sending a message renders it in an Intentive-owned user row", async () => {
  render(<CompanionChat />);
  await typeAndSend("hello companion");
  const userRow = await screen.findByTestId("intentive-user-row");
  expect(userRow).toHaveTextContent("hello companion");
});

test("the dev adapter's canned reply lands in an Intentive-owned assistant row", async () => {
  render(<CompanionChat adapter={createDevChatAdapter({ chunks: ["Canned spike reply."] })} />);
  await typeAndSend("hi");
  const assistantRow = await screen.findByTestId("intentive-assistant-row");
  expect(assistantRow).toHaveTextContent("Canned spike reply.");
});

test("a thinking surface shows while the reply is in flight, then clears", async () => {
  // Delayed multi-chunk reply keeps the thread `running` long enough to observe.
  render(
    <CompanionChat adapter={createDevChatAdapter({ delayMs: 80, chunks: ["Part one ", "part two."] })} />,
  );
  await typeAndSend("hi");
  expect(await screen.findByTestId("intentive-thinking")).toBeTruthy();
  await waitFor(() =>
    expect(screen.getByTestId("intentive-assistant-row")).toHaveTextContent("Part one part two."),
  );
  await waitFor(() => expect(screen.queryByTestId("intentive-thinking")).toBeNull());
});

test("a failed reply surfaces an error + retry, and retry re-runs the adapter", async () => {
  // Fails on the first run, recovers on the second — proving retry re-invokes
  // the adapter through the same boundary (the slot #33 fills with Protocol).
  let calls = 0;
  const flakyAdapter: ChatModelAdapter = {
    async *run() {
      calls += 1;
      if (calls === 1) {
        yield { status: { type: "incomplete", reason: "error", error: "simulated first-attempt failure" } };
        return;
      }
      yield { content: [{ type: "text", text: "Recovered on retry." }] };
    },
  };

  render(<CompanionChat adapter={flakyAdapter} />);
  await typeAndSend("hi");

  expect(await screen.findByTestId("intentive-error")).toBeTruthy();

  fireEvent.press(screen.getByTestId("intentive-retry"));
  await waitFor(() =>
    expect(screen.getByTestId("intentive-assistant-row")).toHaveTextContent("Recovered on retry."),
  );
  expect(calls).toBe(2);
  await waitFor(() => expect(screen.queryByTestId("intentive-error")).toBeNull());
});
