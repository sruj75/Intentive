/**
 * RN tests for the in-memory Account State projection.
 *
 * The projection is the single read-through holder shared by the Mac setup banner
 * and the Account Surface; these tests prove null-without-source, mount hydration,
 * and the stale-identity clearing that a reopened surface relies on.
 */
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";

import { useAccountStateProjection, type AccountStateSource } from "../src/providers/account-state";

function account(userId: string) {
  return {
    user_id: userId,
    next_gate: null,
    has_agent_instance: true,
    has_desktop_client: true,
  };
}

function Harness({ source }: { source?: AccountStateSource }) {
  const { accountState, refreshAccountState } = useAccountStateProjection(source);
  return (
    <>
      <Text testID="user">{accountState?.user_id ?? "none"}</Text>
      <Pressable
        testID="refresh-clear"
        onPress={() => refreshAccountState({ clearBeforeRead: true })}
      >
        <Text>clear</Text>
      </Pressable>
    </>
  );
}

test("projects null when no source is configured", () => {
  render(<Harness />);
  expect(screen.getByTestId("user")).toHaveTextContent("none");
});

test("hydrates account state on mount", async () => {
  render(<Harness source={{ read: async () => account("u_1") }} />);
  expect(await screen.findByText("u_1")).toBeTruthy();
});

test("clearBeforeRead drops stale identity before the next read resolves", async () => {
  let resolveSecond: ((value: ReturnType<typeof account>) => void) | null = null;
  const source: AccountStateSource = {
    read: jest
      .fn()
      .mockResolvedValueOnce(account("u_123"))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      ),
  };

  render(<Harness source={source} />);
  expect(await screen.findByText("u_123")).toBeTruthy();

  fireEvent.press(screen.getByTestId("refresh-clear"));
  expect(screen.getByTestId("user")).toHaveTextContent("none");

  await act(async () => {
    resolveSecond?.(account("u_456"));
  });
  expect(await screen.findByText("u_456")).toBeTruthy();
});

test("rerendering with the same singleton source does not issue another GET /me", async () => {
  const read = jest.fn().mockResolvedValue(account("u_singleton"));
  const source: AccountStateSource = { read };

  const view = render(<Harness source={source} />);
  expect(await screen.findByText("u_singleton")).toBeTruthy();
  expect(read).toHaveBeenCalledTimes(1);

  // An unrelated rerender (props/state churn) with the SAME source reference must
  // not re-read: refreshAccountState is stable across renders for one source, so
  // the mount hydration is the only call (ADR-0030, account-state replay).
  view.rerender(<Harness source={source} />);
  view.rerender(<Harness source={source} />);
  expect(read).toHaveBeenCalledTimes(1);
});

test("a refresh applying a changed account state updates the projection", async () => {
  let resolveSecond: ((value: ReturnType<typeof account>) => void) | null = null;
  const source: AccountStateSource = {
    read: jest
      .fn()
      .mockResolvedValueOnce(account("u_first"))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      ),
  };

  render(<Harness source={source} />);
  expect(await screen.findByText("u_first")).toBeTruthy();

  fireEvent.press(screen.getByTestId("refresh-clear"));
  await act(async () => {
    resolveSecond?.(account("u_changed"));
  });
  // The replay refresh updated the projection so feature gating can change.
  expect(await screen.findByText("u_changed")).toBeTruthy();
});
