/**
 * Dev Chat Adapter — the spike's hardcoded Chat Primitive Engine backend (#22).
 *
 * The canned default behind `<CompanionChat/>`: a vendor `ChatModelAdapter`
 * whose `run` either streams a fixed reply in chunks (proving streaming +
 * loading surface) or throws (proving the error/retry surface). It speaks NO
 * Protocol and reaches no network.
 *
 * This is the one seam #33 swaps: the real Protocol-backed `ChatModelAdapter`
 * is injected into the same `<CompanionChat adapter={...}/>` prop, and the UI
 * wrapper stays unchanged. The injection type is the vendor `ChatModelAdapter`
 * on purpose (the spike evaluates the vendor adapter directly); whether to wrap
 * it behind an Intentive adapter interface is deferred to #33 (ADR 0009).
 *
 * RN-free at runtime — the `import type` is erased on compile — so it lives in
 * the pure-core build path and is unit-tested under node:test.
 */
import type { ChatModelAdapter } from "@assistant-ui/react-native";

export type DevChatAdapterMode = "reply" | "error";

export interface DevChatAdapterOptions {
  /** "reply" streams a canned answer; "error" throws to exercise retry. */
  readonly mode?: DevChatAdapterMode;
  /** Per-chunk delay (ms) so callers/tests can observe the in-flight state. */
  readonly delayMs?: number;
  /** Override the canned reply chunks (joined cumulatively as they stream). */
  readonly chunks?: readonly string[];
}

const DEFAULT_REPLY_CHUNKS = [
  "Hey — I'm your Intentive companion. ",
  "This reply is a dev placeholder ",
  "from the spike adapter.",
] as const;

/**
 * Build a canned `ChatModelAdapter`. Defaults to a multi-chunk reply with no
 * delay (instant for tests); pass `delayMs` to make the loading state
 * observable, or `mode: "error"` to make `run` throw.
 */
export function createDevChatAdapter(options: DevChatAdapterOptions = {}): ChatModelAdapter {
  const { mode = "reply", delayMs = 0, chunks = DEFAULT_REPLY_CHUNKS } = options;

  return {
    // ChatModelAdapter.run is an async generator. THE non-obvious vendor contract:
    // each yield carries the *cumulative* message, not a delta — see #33 before
    // wiring a real backend. https://www.assistant-ui.com/docs/runtimes/custom/local-runtime#streaming-responses
    async *run({ abortSignal }) {
      if (mode === "error") {
        await maybeDelay(delayMs, abortSignal);
        if (abortSignal.aborted) return;
        // Signal failure by returning an error STATUS rather than throwing: the
        // runtime records a thrown error on the message but also rejects the run
        // promise (an unhandled rejection in tests). An error-status result
        // drives the same error/retry UI without that side effect.
        yield {
          status: {
            type: "incomplete",
            reason: "error",
            error: "Dev chat adapter simulated failure",
          },
        };
        return;
      }

      let text = "";
      for (const chunk of chunks) {
        await maybeDelay(delayMs, abortSignal);
        if (abortSignal.aborted) return;
        text += chunk; // accumulate — the yield below replaces, not appends
        yield { content: [{ type: "text", text }] };
      }
    },
  };
}

// Resolve (don't reject) on abort: the generator checks `aborted` and returns
// cleanly, so cancelling a run mid-stream — e.g. a component unmount — never
// surfaces as an unhandled rejection or a spurious message error.
function maybeDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
