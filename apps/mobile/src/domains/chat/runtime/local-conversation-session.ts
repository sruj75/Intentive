import { chatContent, createReadyTimeline } from "../config/content.js";
import type {
  ConversationSession,
  ConversationSessionSnapshot,
  ConversationTimelineItem,
} from "../types/conversation-timeline.js";

declare function setTimeout(callback: () => void, delayMs: number): unknown;
declare function clearTimeout(handle: unknown): void;

export interface ConversationScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface LocalConversationSessionOptions {
  readonly firstName?: string;
  readonly scheduler?: ConversationScheduler;
  readonly delays?: {
    readonly thinkingMs: number;
    readonly composingMs: number;
    readonly replyMs: number;
  };
}

const defaultScheduler: ConversationScheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle),
};

const defaultDelays = { thinkingMs: 450, composingMs: 1_050, replyMs: 1_750 } as const;

function replaceActivity(
  items: readonly ConversationTimelineItem[],
  activity: ConversationTimelineItem,
): readonly ConversationTimelineItem[] {
  return [...items.filter((item) => item.kind !== "activity"), activity];
}

export function createLocalConversationSession(
  options: LocalConversationSessionOptions = {},
): ConversationSession {
  const scheduler = options.scheduler ?? defaultScheduler;
  const delays = options.delays ?? defaultDelays;
  const listeners = new Set<() => void>();
  const timerHandles = new Set<unknown>();
  let snapshot: ConversationSessionSnapshot = { timeline: createReadyTimeline(), phase: "idle" };
  let disposed = false;
  let turnId = 0;

  const publish = (next: ConversationSessionSnapshot): void => {
    if (disposed || Object.is(next, snapshot)) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  const clearTimers = (): void => {
    timerHandles.forEach((handle) => scheduler.clearTimeout(handle));
    timerHandles.clear();
  };

  const schedule = (callback: () => void, delayMs: number): void => {
    let handle: unknown;
    handle = scheduler.setTimeout(() => {
      timerHandles.delete(handle);
      if (!disposed) callback();
    }, delayMs);
    timerHandles.add(handle);
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send(message) {
      const text = message.trim();
      if (disposed || text.length === 0) return;
      clearTimers();
      turnId += 1;
      const activeTurn = turnId;
      const responseNumber = snapshot.timeline.filter(
        (item) => item.kind === "companion_message",
      ).length;
      publish({
        phase: "user_sent",
        timeline: [
          ...snapshot.timeline.filter(
            (item) => item.kind === "user_message" || item.kind === "companion_message",
          ),
          { id: `user-${activeTurn}`, kind: "user_message", text },
        ],
      });

      schedule(() => {
        if (activeTurn !== turnId) return;
        publish({
          phase: "thinking",
          timeline: replaceActivity(snapshot.timeline, {
            id: `activity-${activeTurn}`,
            kind: "activity",
            phase: "thinking",
          }),
        });
      }, delays.thinkingMs);

      schedule(() => {
        if (activeTurn !== turnId) return;
        publish({
          phase: "composing",
          timeline: replaceActivity(snapshot.timeline, {
            id: `activity-${activeTurn}`,
            kind: "activity",
            phase: "composing",
          }),
        });
      }, delays.composingMs);

      schedule(() => {
        if (activeTurn !== turnId) return;
        const reply =
          responseNumber === 0
            ? chatContent.firstReply.replace(
                "{firstName}",
                options.firstName || chatContent.replyNameFallback,
              )
            : chatContent.laterReply;
        publish({
          phase: "replied",
          timeline: [
            ...snapshot.timeline.filter((item) => item.kind !== "activity"),
            { id: `companion-${activeTurn}`, kind: "companion_message", text: reply },
          ],
        });
      }, delays.replyMs);
    },
    dispose() {
      if (disposed) return;
      clearTimers();
      listeners.clear();
      disposed = true;
    },
  };
}
