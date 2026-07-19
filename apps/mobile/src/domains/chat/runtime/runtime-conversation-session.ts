/**
 * Runtime Conversation Session — the translation adapter that lets the mounted
 * chat UI drive the real Agent Runtime. `ConversationScene` renders a
 * `ConversationSession` (`getSnapshot() → { timeline, phase }`, `send`,
 * `dispose`); the dormant `RuntimeAdapter` speaks a different shape
 * (`getState() → { messages, connectionState, agentState, error }`,
 * `connect`/`sendUserMessage`/`close`) over Protocol `ConversationMessage`s.
 * This wraps `createRuntimeAdapter` and projects its state onto the UI session
 * contract, so `ConversationScene` stays unchanged (ADR-0026; the engine itself
 * is ADR-0009).
 *
 * It lives in the chat `runtime/` layer alongside `local-conversation-session`
 * (the injectable offline default) and mirrors its lifecycle: it opens the
 * connection eagerly on creation and closes it on `dispose`.
 */
import { createReadyTimeline } from "../config/content.js";
import type {
  ChatPhase,
  ConversationSession,
  ConversationSessionSnapshot,
  ConversationTimelineItem,
} from "../types/conversation-timeline.js";
import type { RuntimeAdapterState } from "../types/conversation.js";
import { createRuntimeAdapter, type RuntimeAdapterDeps } from "./runtime-adapter.js";

/**
 * Project the Runtime Adapter's server-truth message window onto the timeline
 * the UI renders. The ready scaffold (capability card + suggestions) is kept as
 * the opening rows so the runtime-backed ready state matches the local one, then
 * each `ConversationMessage` becomes a user/companion row. A live "thinking"
 * Agent State appends the activity indicator the scene already knows how to draw.
 */
export function projectTimeline(state: RuntimeAdapterState): readonly ConversationTimelineItem[] {
  const items: ConversationTimelineItem[] = [...createReadyTimeline()];
  for (const message of state.messages) {
    items.push(
      message.author === "user"
        ? { id: message.id, kind: "user_message", text: message.body }
        : { id: message.id, kind: "companion_message", text: message.body },
    );
  }
  if (state.agentState === "thinking") {
    items.push({ id: "activity-live", kind: "activity", phase: "thinking" });
  }
  return items;
}

/**
 * Project connection/agent state onto the UI `ChatPhase`. The Runtime Adapter's
 * only in-flight signal is Agent State `thinking`; otherwise the phase follows
 * the latest message so a settled timeline reads `replied`/`user_sent`/`idle`.
 */
export function projectPhase(state: RuntimeAdapterState): ChatPhase {
  if (state.agentState === "thinking") return "thinking";
  const latest = state.messages[state.messages.length - 1];
  if (!latest) return "idle";
  return latest.author === "companion" ? "replied" : "user_sent";
}

function toSnapshot(state: RuntimeAdapterState): ConversationSessionSnapshot {
  return { timeline: projectTimeline(state), phase: projectPhase(state) };
}

/**
 * Build a `ConversationSession` backed by the real Agent Runtime. The snapshot is
 * recomputed on every adapter notification and cached, so `getSnapshot` returns a
 * stable reference between changes — the contract `useSyncExternalStore` needs.
 */
export function createRuntimeConversationSession(deps: RuntimeAdapterDeps): ConversationSession {
  const adapter = createRuntimeAdapter(deps);
  const listeners = new Set<() => void>();
  let snapshot = toSnapshot(adapter.getState());
  let disposed = false;

  const unsubscribeAdapter = adapter.subscribe(() => {
    if (disposed) return;
    snapshot = toSnapshot(adapter.getState());
    for (const listener of listeners) listener();
  });

  // Open the Runtime connection eagerly: `hello_ok` seeds the timeline and any
  // send issued before it flushes once connected (the adapter queues outbound).
  void adapter.connect();

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    send(message) {
      void adapter.sendUserMessage(message);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribeAdapter();
      listeners.clear();
      adapter.close();
    },
  };
}
