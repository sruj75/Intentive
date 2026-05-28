import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import Onboarding from "../Onboarding";

type ProgressPayload = { percent: number; status: string };
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
  // Two ticks: one for the `listen` Promise to resolve, one for any
  // follow-on setState that schedules another microtask.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  listeners.clear();
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe("Onboarding surface", () => {
  it("renders the Welcome step with a Continue button on first paint", () => {
    render(<Onboarding />);
    expect(screen.getByRole("heading", { level: 1, name: /set up intentive/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /continue/i })).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("invokes start_model_download exactly once when Continue is pressed", async () => {
    render(<Onboarding />);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await flush();
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("start_model_download");
  });

  it("updates the progress bar as bundled-ollama:progress events arrive", async () => {
    render(<Onboarding />);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await flush();

    await act(async () => {
      emit<ProgressPayload>("bundled-ollama:progress", {
        percent: 25,
        status: "pulling",
      });
    });
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("25");

    await act(async () => {
      emit<ProgressPayload>("bundled-ollama:progress", {
        percent: 80,
        status: "pulling",
      });
    });
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("80");
  });

  it("shows the Done step when bundled-ollama:complete fires", async () => {
    render(<Onboarding />);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await flush();

    await act(async () => {
      emit("bundled-ollama:complete", null);
    });
    expect(screen.getByText(/intentive is ready/i)).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("shows an error with a Retry button when bundled-ollama:failed fires, and Retry re-invokes the command", async () => {
    render(<Onboarding />);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await flush();
    expect(invokeMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      emit("bundled-ollama:failed", "network error");
    });
    expect(screen.getByText(/network error/i)).toBeTruthy();

    const retry = screen.getByRole("button", { name: /retry/i });
    fireEvent.click(retry);
    await flush();
    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(invokeMock).toHaveBeenLastCalledWith("start_model_download");
  });

  it("shows an error with Retry when the Tauri command cannot be invoked", async () => {
    invokeMock.mockRejectedValueOnce("command not found");

    render(<Onboarding />);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await flush();

    expect(screen.getByText(/command not found/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
  });

  it("disables the Continue button while the download is in flight", async () => {
    let resolveInvoke: (() => void) | undefined;
    invokeMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveInvoke = resolve;
        }),
    );

    render(<Onboarding />);
    const button = screen.getByRole("button", { name: /continue/i });
    fireEvent.click(button);
    await flush();

    // After clicking, the Welcome's Continue button should no longer be
    // present (we move to the Progress step) — alternatively, if the design
    // keeps the same button visible, it must be disabled.
    expect(screen.queryByRole("button", { name: /continue/i })).toBeNull();

    // Resolve the pending invoke so the test doesn't leak a hanging promise.
    resolveInvoke?.();
    await flush();
  });
});
