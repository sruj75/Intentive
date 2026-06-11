import { afterEach, describe, expect, it, vi } from "vitest";
import type React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";

// Hoisted so the static import of the component sees initialized mocks.
const { readNeonAuthUrl, createIntentiveAuthClient, syncLoginTokenToRust } = vi.hoisted(() => ({
  readNeonAuthUrl: vi.fn(() => "https://auth.example"),
  createIntentiveAuthClient: vi.fn(() => ({ id: "client" })),
  syncLoginTokenToRust: vi.fn(),
}));

vi.mock("@neondatabase/neon-js/auth/react", () => ({
  NeonAuthUIProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="neon-provider">{children}</div>
  ),
}));

vi.mock("@neondatabase/neon-js/ui/css", () => ({}));

vi.mock("../domains/auth/service/auth", () => ({
  readNeonAuthUrl,
  createIntentiveAuthClient,
  syncLoginTokenToRust,
}));

import IntentiveAuthProvider from "../domains/auth/ui/IntentiveAuthProvider";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  readNeonAuthUrl.mockClear();
  createIntentiveAuthClient.mockClear();
  syncLoginTokenToRust.mockReset();
});

describe("IntentiveAuthProvider", () => {
  it("renders children inside the Neon provider and syncs the login token on mount", async () => {
    syncLoginTokenToRust.mockResolvedValue({ kind: "unknown" });

    render(
      <IntentiveAuthProvider>
        <span>child surface</span>
      </IntentiveAuthProvider>,
    );

    expect(screen.getByTestId("neon-provider")).toBeTruthy();
    expect(screen.getByText("child surface")).toBeTruthy();
    expect(createIntentiveAuthClient).toHaveBeenCalledWith("https://auth.example");
    expect(syncLoginTokenToRust).toHaveBeenCalledTimes(1);

    // Let the resolved sync settle so its .then runs.
    await act(async () => {
      await Promise.resolve();
    });
  });

  it("re-syncs on window focus and on the polling interval, then stops after unmount", async () => {
    vi.useFakeTimers();
    syncLoginTokenToRust.mockResolvedValue({ kind: "signed_out" });

    const { unmount } = render(
      <IntentiveAuthProvider>
        <span>child</span>
      </IntentiveAuthProvider>,
    );

    expect(syncLoginTokenToRust).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(syncLoginTokenToRust).toHaveBeenCalledTimes(2);

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(syncLoginTokenToRust).toHaveBeenCalledTimes(3);

    unmount();

    act(() => {
      window.dispatchEvent(new Event("focus"));
      vi.advanceTimersByTime(10_000);
    });
    // No further syncs once cleanup has run.
    expect(syncLoginTokenToRust).toHaveBeenCalledTimes(3);
  });

  it("swallows sync rejection without throwing", async () => {
    syncLoginTokenToRust.mockRejectedValue(new Error("no rust host"));

    render(
      <IntentiveAuthProvider>
        <span>child</span>
      </IntentiveAuthProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(syncLoginTokenToRust).toHaveBeenCalledTimes(1);
  });
});
