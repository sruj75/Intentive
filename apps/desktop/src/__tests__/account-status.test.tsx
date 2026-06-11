import { afterEach, describe, expect, it, vi } from "vitest";
import type React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import AccountSettingsSurface from "../domains/account/ui/AccountSettingsSurface";

// Hoisted so the static import of the component (which pulls in
// "@tauri-apps/api/core") sees an initialized mock, not a TDZ reference.
const { invoke, listen, unlisten, emitStatus } = vi.hoisted(() => {
  let handler: ((event: { payload: { mood: string } }) => void) | undefined;
  const unlistenFn = vi.fn();
  return {
    invoke: vi.fn(),
    unlisten: unlistenFn,
    listen: vi.fn((_event: string, cb: (event: { payload: { mood: string } }) => void) => {
      handler = cb;
      return Promise.resolve(unlistenFn);
    }),
    emitStatus: (mood: string) => handler?.({ payload: { mood } }),
  };
});

vi.mock("@neondatabase/neon-js/auth/react/ui", () => ({
  AuthView: () => <section aria-label="Neon Auth">Neon AuthView</section>,
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  UserButton: () => <button type="button">Intentive account</button>,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke,
}));

afterEach(() => {
  cleanup();
  invoke.mockReset();
  listen.mockClear();
  unlisten.mockClear();
});

describe("Settings status replay", () => {
  it("seeds the Status from get_connection_status on mount", async () => {
    invoke.mockImplementation((command: string) =>
      command === "get_connection_status"
        ? Promise.resolve({ mood: "connected" })
        : Promise.resolve(undefined),
    );

    render(<AccountSettingsSurface surface="settings" />);

    expect(await screen.findByText("Connected")).toBeTruthy();
    expect(invoke).toHaveBeenCalledWith("get_connection_status");
  });

  it("updates the Status from a live routing:status event and unsubscribes on unmount", async () => {
    invoke.mockResolvedValue(undefined);

    const { unmount } = render(<AccountSettingsSurface surface="settings" />);

    // Let the listen() promise resolve so the unlisten cleanup is stored.
    await screen.findByText("Signed out");

    act(() => {
      emitStatus("reconnecting");
    });

    expect(await screen.findByText("Reconnecting...")).toBeTruthy();

    unmount();
    expect(unlisten).toHaveBeenCalled();
  });
});
