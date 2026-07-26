import type { Logger } from "@intentive/providers/telemetry";
import { createNoopLogger } from "@intentive/providers/telemetry";

import type { BoundSession, CoachingWindowLifecycleEvent } from "../../sessions/types/event.js";

export type CoachingProactiveKind = "orientation" | "intervention";

export interface CoachingMetrics {
  onLifecycle(userId: string, event: CoachingWindowLifecycleEvent): void;
  onProactiveDelivered(input: {
    readonly userId: string;
    readonly windowId: string;
    readonly messageId: string;
    readonly kind: CoachingProactiveKind;
  }): void;
  onUserMessage(session: Pick<BoundSession, "userId" | "clientKind" | "capabilities">): void;
}

interface ReplyAnchor {
  readonly messageId: string;
  readonly kind: CoachingProactiveKind;
  readonly deliveredAt: number;
}

interface WindowMetricsState {
  readonly windowId: string;
  orientation: ReplyAnchor | null;
  firstReplyRecorded: boolean;
  pendingReply: ReplyAnchor | null;
}

/**
 * Content-free, process-bounded Founder Preview metrics.
 *
 * This intentionally retains only one active window and timing/message
 * identities per User. Lifecycle end deletes the state; no message bodies,
 * perception text, or durable memory enter this module.
 */
export function createCoachingMetrics(
  params: {
    readonly logger?: Logger;
    readonly clock?: () => number;
    readonly isEnabled?: (userId: string) => boolean;
  } = {},
): CoachingMetrics {
  const logger = params.logger ?? createNoopLogger();
  const clock = params.clock ?? Date.now;
  const isEnabled = params.isEnabled ?? (() => true);
  const windows = new Map<string, WindowMetricsState>();

  return {
    onLifecycle(userId, event) {
      if (event.type === "coaching_window_started") {
        windows.delete(userId);
        if (!isEnabled(userId)) {
          return;
        }
        windows.set(userId, {
          windowId: event.window_id,
          orientation: null,
          firstReplyRecorded: false,
          pendingReply: null,
        });
        if (event.reason === "user_resume") {
          logger.info("coaching.resume", {
            user_id: userId,
            reason: event.reason,
            count: 1,
            status: "ok",
          });
        }
        return;
      }

      const state = windows.get(userId);
      if (!state || state.windowId !== event.window_id) {
        return;
      }
      windows.delete(userId);
      if (event.reason === "pause") {
        logger.info("coaching.pause", {
          user_id: userId,
          reason: event.reason,
          count: 1,
          status: "ok",
        });
      }
    },

    onProactiveDelivered(input) {
      const state = windows.get(input.userId);
      if (!state || state.windowId !== input.windowId) {
        return;
      }
      const anchor: ReplyAnchor = {
        messageId: input.messageId,
        kind: input.kind,
        deliveredAt: clock(),
      };
      if (input.kind === "orientation") {
        // A stable Opening Orientation may be resent after a post-send database
        // failure. Preserve the first visible-send anchor rather than resetting
        // first-reply latency on an idempotent retry.
        state.orientation ??= anchor;
        state.pendingReply ??= state.orientation;
        return;
      }
      state.pendingReply = anchor;
    },

    onUserMessage(session) {
      if (
        session.clientKind !== "desktop" ||
        !session.capabilities.includes("desktop_coaching_v1")
      ) {
        return;
      }
      const state = windows.get(session.userId);
      if (!state) {
        return;
      }
      const repliedAt = clock();
      if (state.orientation && !state.firstReplyRecorded) {
        state.firstReplyRecorded = true;
        logger.info("coaching.first_reply", {
          user_id: session.userId,
          message_id: state.orientation.messageId,
          category: state.orientation.kind,
          count: 1,
          duration_ms: elapsedMs(state.orientation.deliveredAt, repliedAt),
          status: "ok",
        });
      }
      if (state.pendingReply) {
        logger.info("coaching.reply_latency", {
          user_id: session.userId,
          message_id: state.pendingReply.messageId,
          category: state.pendingReply.kind,
          count: 1,
          duration_ms: elapsedMs(state.pendingReply.deliveredAt, repliedAt),
          status: "ok",
        });
        state.pendingReply = null;
      }
    },
  };
}

function elapsedMs(startedAt: number, endedAt: number): number {
  return Math.max(0, endedAt - startedAt);
}
