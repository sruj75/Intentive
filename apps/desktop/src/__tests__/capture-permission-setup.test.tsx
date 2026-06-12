import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import CapturePermissionSetup from "../domains/onboarding/ui/CapturePermissionSetup";

type PermissionSet = {
  screen_recording: boolean;
  microphone: boolean;
  accessibility: boolean;
};
type Handler<T> = (event: { payload: T }) => void;

const listeners = new Map<string, Set<Handler<unknown>>>();
const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async <T,>(event: string, handler: Handler<T>): Promise<() => void> => {
    const set = (listeners.get(event) ?? new Set()) as Set<Handler<unknown>>;
    set.add(handler as Handler<unknown>);
    listeners.set(event, set);
    return () => {
      set.delete(handler as Handler<unknown>);
    };
  }),
}));

function emit<T>(event: string, payload: T) {
  const set = listeners.get(event);
  if (!set) return;
  for (const handler of set) {
    (handler as Handler<T>)({ payload });
  }
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  localStorage.clear();
  listeners.clear();
  invokeMock.mockReset();
  invokeMock.mockResolvedValue({
    screen_recording: false,
    microphone: false,
    accessibility: false,
  } satisfies PermissionSet);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Capture Permission Setup", () => {
  it("opens with the Mac-local consent acknowledgement", async () => {
    render(<CapturePermissionSetup />);
    await flush();

    expect(
      screen.getByRole("heading", { level: 1, name: "Capture Permission Setup" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  });

  it("resumes at the first ungranted permission after acknowledgement", async () => {
    invokeMock.mockResolvedValueOnce({
      screen_recording: true,
      microphone: false,
      accessibility: false,
    } satisfies PermissionSet);

    render(<CapturePermissionSetup />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("heading", { level: 1, name: "Microphone" })).toBeTruthy();
  });

  it("resumes at the first ungranted permission when consent was already acknowledged", async () => {
    localStorage.setItem("intentive.capture-consent-acknowledged", "true");
    invokeMock.mockResolvedValueOnce({
      screen_recording: true,
      microphone: false,
      accessibility: false,
    } satisfies PermissionSet);

    render(<CapturePermissionSetup />);
    await flush();

    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Microphone" })).toBeTruthy();
  });

  it("opens the current permission pane and rechecks status", async () => {
    render(<CapturePermissionSetup />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    fireEvent.click(screen.getByRole("button", { name: "Open Screen Recording Settings" }));
    expect(invokeMock).toHaveBeenCalledWith("open_permission_pane", {
      kind: "screen_recording",
    });

    fireEvent.click(screen.getByRole("button", { name: "Recheck" }));
    await flush();
    expect(invokeMock).toHaveBeenCalledWith("capture_permission_status");
  });

  it("auto-advances as permissions:status events arrive", async () => {
    render(<CapturePermissionSetup />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await act(async () => {
      emit<PermissionSet>("permissions:status", {
        screen_recording: true,
        microphone: false,
        accessibility: false,
      });
    });
    expect(screen.getByRole("heading", { level: 1, name: "Microphone" })).toBeTruthy();

    await act(async () => {
      emit<PermissionSet>("permissions:status", {
        screen_recording: true,
        microphone: true,
        accessibility: true,
      });
    });
    expect(screen.getByRole("heading", { level: 1, name: "Capture is ready" })).toBeTruthy();
  });

  it("does not self-poll — the detection engine owns the granular poll", async () => {
    // The webview seeds once on mount, then renders from emitted
    // `permissions:status` events. It must NOT run its own recurring poll;
    // advancing time triggers no further `capture_permission_status` calls.
    vi.useFakeTimers();
    render(<CapturePermissionSetup />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    const statusCalls = () =>
      invokeMock.mock.calls.filter(([command]) => command === "capture_permission_status").length;
    const seeded = statusCalls();
    expect(seeded).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(statusCalls()).toBe(seeded);
  });
});
