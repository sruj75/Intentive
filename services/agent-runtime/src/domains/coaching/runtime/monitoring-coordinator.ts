import type { CoachingWindowPresence, PerceptionEvent } from "@intentive/protocol";
import type { Logger } from "@intentive/providers/telemetry";
import { createNoopLogger } from "@intentive/providers/telemetry";

import type { PinnedProcedureFloor } from "../../bundles/types/floor.js";
import type { ConnectionRegistry } from "../../delivery/types/delivery.js";
import type { TurnSqlQuery } from "../../runtime/types/turn.js";
import type {
  BoundSession,
  CoachingWindowLifecycleEvent,
  PerUserChannel,
} from "../../sessions/types/event.js";
import type { CoachingFeatureGate } from "../service/feature-gate.js";
import type { OpeningOrientation } from "../service/opening-orientation.js";
import type {
  CoachingMonitoringState,
  CoachingWindowsRepo,
  RecentCoachingEvidenceReader,
} from "../types/coaching.js";

const DEFAULT_JUDGMENT_FLOOR_MS = 120_000;
const DEFAULT_OPENING_RETRY_BASE_MS = 1_000;
const DEFAULT_OPENING_RETRY_MAX_MS = 30_000;

type MonitoringTurnTrigger = "heartbeat" | "perception_event";

interface MonitoringTurnContext {
  readonly windowId: string;
  readonly floor: PinnedProcedureFloor;
  readonly evidence: {
    readonly cursorStart: number;
    readonly cursorEnd: number;
    readonly version: string;
    readonly rendered: string;
  };
  readonly beforeCommit: () => Promise<boolean>;
  readonly onSuccessQueries: () => TurnSqlQuery[];
  readonly onFailureQueries: () => TurnSqlQuery[];
}

export interface CoachingPresenceAdmission {
  readonly accepted: boolean;
  readonly afterApply?: () => Promise<void>;
}

export interface MonitoringCoordinator {
  onLifecycle(session: BoundSession, event: CoachingWindowLifecycleEvent): void;
  onPresence(
    session: BoundSession,
    event: CoachingWindowPresence,
  ): Promise<CoachingPresenceAdmission>;
  onDeliveryAck(session: BoundSession, messageId: string): Promise<void>;
  onPerception(session: BoundSession, event: PerceptionEvent): boolean;
  onHeartbeat(userId: string): boolean;
}

export function createMonitoringCoordinator(params: {
  readonly gate: CoachingFeatureGate;
  readonly windows: Pick<
    CoachingWindowsRepo,
    | "acknowledgeOpening"
    | "readMonitoringState"
    | "isActive"
    | "advanceEvidenceQuery"
    | "recordJudgmentAttemptQuery"
  >;
  readonly evidence: RecentCoachingEvidenceReader;
  readonly connections: Pick<ConnectionRegistry, "hasActiveCoachingWindow">;
  readonly channel: Pick<PerUserChannel, "enqueueCommitted" | "enqueueBestEffort">;
  readonly opening: OpeningOrientation;
  readonly monitoringTurn: (
    userId: string,
    trigger: MonitoringTurnTrigger,
    context: MonitoringTurnContext,
  ) => Promise<boolean>;
  readonly scheduler: {
    schedule(userId: string, dueAt: Date): void;
    cancel(userId: string): void;
  };
  readonly floorMs?: number;
  readonly openingRetryBaseMs?: number;
  readonly openingRetryMaxMs?: number;
  readonly clock?: () => Date;
  readonly logger?: Logger;
}): MonitoringCoordinator {
  const floorMs = params.floorMs ?? DEFAULT_JUDGMENT_FLOOR_MS;
  const openingRetryBaseMs = params.openingRetryBaseMs ?? DEFAULT_OPENING_RETRY_BASE_MS;
  const openingRetryMaxMs = params.openingRetryMaxMs ?? DEFAULT_OPENING_RETRY_MAX_MS;
  const clock = params.clock ?? (() => new Date());
  const logger = params.logger ?? createNoopLogger();
  const starts = new Map<string, { readonly windowId: string; readonly at: Date }>();
  const activeFloors = new Map<
    string,
    { readonly windowId: string; readonly floor: PinnedProcedureFloor }
  >();
  const openingRetries = new Map<
    string,
    { readonly windowId: string; readonly attempts: number }
  >();

  function isEligibleSession(session: BoundSession): boolean {
    return params.gate.isEnabled(session.userId) && supportsCoaching(session);
  }

  function scheduleState(state: CoachingMonitoringState): void {
    const anchor = state.lastMonitoringTurnAt ?? state.orientationCompletedAt;
    params.scheduler.schedule(state.userId, new Date(anchor.getTime() + floorMs));
  }

  function clearOpeningRetry(userId: string, windowId?: string): void {
    const retry = openingRetries.get(userId);
    if (!retry || (windowId !== undefined && retry.windowId !== windowId)) {
      return;
    }
    openingRetries.delete(userId);
  }

  function scheduleOpeningRetry(userId: string, windowId: string): void {
    const current = openingRetries.get(userId);
    const attempts = current?.windowId === windowId ? current.attempts + 1 : 1;
    openingRetries.set(userId, { windowId, attempts });
    const exponent = Math.min(attempts - 1, 30);
    const delayMs = Math.min(openingRetryBaseMs * 2 ** exponent, openingRetryMaxMs);
    params.scheduler.schedule(userId, new Date(clock().getTime() + delayMs));
  }

  async function attemptOpening(
    userId: string,
    windowId: string,
    floor: PinnedProcedureFloor,
  ): Promise<void> {
    if (
      !params.gate.isEnabled(userId) ||
      !params.connections.hasActiveCoachingWindow(userId, windowId) ||
      !(await params.windows.isActive(userId, windowId))
    ) {
      params.scheduler.cancel(userId);
      return;
    }

    try {
      await params.opening.run(userId, windowId, floor);
      const state = await params.windows.readMonitoringState(userId);
      if (state?.windowId === windowId) {
        clearOpeningRetry(userId, windowId);
        scheduleState(state);
        return;
      }
    } catch {
      logger.warn("coaching.orientation_retry_scheduled", {
        user_id: userId,
        status: "failed",
      });
    }

    if (
      params.gate.isEnabled(userId) &&
      params.connections.hasActiveCoachingWindow(userId, windowId) &&
      (await params.windows.isActive(userId, windowId))
    ) {
      scheduleOpeningRetry(userId, windowId);
    }
  }

  async function runScheduledWork(userId: string): Promise<void> {
    const pinned = activeFloors.get(userId);
    if (pinned) {
      const state = await params.windows.readMonitoringState(userId);
      if (!state || state.windowId !== pinned.windowId) {
        await attemptOpening(userId, pinned.windowId, pinned.floor);
        return;
      }
    }
    await runMonitoring(userId, "heartbeat");
  }

  async function runMonitoring(
    userId: string,
    trigger: MonitoringTurnTrigger,
    requestedWindowId?: string,
  ): Promise<void> {
    try {
      await runMonitoringAttempt(userId, trigger, requestedWindowId);
    } catch {
      const retryAt = new Date(clock().getTime() + floorMs);
      params.scheduler.schedule(userId, retryAt);
      logger.warn("coaching.monitoring_retry_scheduled", {
        user_id: userId,
        trigger,
        status: "failed",
        count: 1,
      });
    }
  }

  async function runMonitoringAttempt(
    userId: string,
    trigger: MonitoringTurnTrigger,
    requestedWindowId?: string,
  ): Promise<void> {
    if (!params.gate.isEnabled(userId)) {
      params.scheduler.cancel(userId);
      return;
    }

    const state = await params.windows.readMonitoringState(userId);
    if (!state) {
      params.scheduler.cancel(userId);
      return;
    }
    if (requestedWindowId && requestedWindowId !== state.windowId) {
      return;
    }
    if (!params.connections.hasActiveCoachingWindow(userId, state.windowId)) {
      params.scheduler.cancel(userId);
      return;
    }
    const pinned = activeFloors.get(userId);
    if (!pinned || pinned.windowId !== state.windowId) {
      params.scheduler.cancel(userId);
      return;
    }

    const anchor = state.lastMonitoringTurnAt ?? state.orientationCompletedAt;
    const dueAt = new Date(anchor.getTime() + floorMs);
    if (clock().getTime() < dueAt.getTime()) {
      params.scheduler.schedule(userId, dueAt);
      return;
    }

    const evidence = await params.evidence.read({
      userId,
      windowId: state.windowId,
      afterCursor: state.evidenceCursor,
    });
    if (!evidence) {
      params.scheduler.schedule(userId, new Date(clock().getTime() + floorMs));
      return;
    }

    const succeeded = await params.monitoringTurn(userId, trigger, {
      windowId: state.windowId,
      floor: pinned.floor,
      evidence,
      beforeCommit: async () =>
        params.gate.isEnabled(userId) &&
        params.connections.hasActiveCoachingWindow(userId, state.windowId) &&
        (await params.windows.isActive(userId, state.windowId)) &&
        (await params.evidence.isCurrent({
          userId,
          windowId: state.windowId,
          cursorStart: evidence.cursorStart,
          cursorEnd: evidence.cursorEnd,
          version: evidence.version,
        })),
      onSuccessQueries: () => [
        params.windows.advanceEvidenceQuery({
          userId,
          windowId: state.windowId,
          cursorEnd: evidence.cursorEnd,
          evidenceVersion: evidence.version,
          completedAt: clock(),
        }),
      ],
      onFailureQueries: () => [
        params.windows.recordJudgmentAttemptQuery({
          userId,
          windowId: state.windowId,
          attemptedAt: clock(),
        }),
      ],
    });

    const details = {
      user_id: userId,
      trigger,
      attempts: evidence.eventIds.length,
      queue_latency_ms: Math.max(0, clock().getTime() - evidence.oldestCapturedAt.getTime()),
      status: succeeded ? "ok" : "failed",
    } as const;
    if (succeeded) {
      logger.info("coaching.monitoring_turn", details);
    } else {
      logger.warn("coaching.monitoring_turn", details);
    }
    params.scheduler.schedule(userId, new Date(clock().getTime() + floorMs));
  }

  return {
    onLifecycle(session, event) {
      if (event.type === "coaching_window_ended") {
        const active = activeFloors.get(session.userId);
        if (active && active.windowId !== event.window_id) {
          return;
        }
        params.scheduler.cancel(session.userId);
        if (activeFloors.get(session.userId)?.windowId === event.window_id) {
          activeFloors.delete(session.userId);
        }
        clearOpeningRetry(session.userId, event.window_id);
        const start = starts.get(session.userId);
        if (start?.windowId === event.window_id) {
          starts.delete(session.userId);
        }
        logger.info("coaching.window_ended", {
          user_id: session.userId,
          reason: event.reason,
          ...(start?.windowId === event.window_id
            ? {
                duration_ms: Math.max(0, new Date(event.ended_at).getTime() - start.at.getTime()),
              }
            : {}),
          status: "ok",
        });
        return;
      }
      // A new pending Opening Orientation must not inherit a timer from a
      // superseded window. Monitoring becomes schedulable only after Desktop
      // acknowledges the stable opening message.
      params.scheduler.cancel(session.userId);
      if (!isEligibleSession(session)) {
        return;
      }
      starts.set(session.userId, {
        windowId: event.window_id,
        at: new Date(event.started_at),
      });
      activeFloors.set(session.userId, {
        windowId: event.window_id,
        floor: session.pinnedFloor,
      });
      clearOpeningRetry(session.userId);
      logger.info("coaching.window_started", {
        user_id: session.userId,
        reason: event.reason,
        status: "ok",
      });
      if (params.connections.hasActiveCoachingWindow(session.userId, event.window_id)) {
        void params.channel
          .enqueueCommitted(session.userId, () =>
            attemptOpening(session.userId, event.window_id, session.pinnedFloor),
          )
          .catch(() => {
            scheduleOpeningRetry(session.userId, event.window_id);
          });
      }
    },

    async onPresence(session, event) {
      if (!isEligibleSession(session)) {
        return event.state === "locked" ? acceptedPresence() : rejectedPresence();
      }
      const pinned = activeFloors.get(session.userId);
      if (pinned && pinned.windowId !== event.window_id) {
        return event.state === "locked" ? acceptedPresence() : rejectedPresence();
      }
      if (event.state === "locked") {
        if (!(await params.windows.isActive(session.userId, event.window_id))) {
          return acceptedPresence();
        }
        return acceptedPresence(async () => {
          if (activeFloors.get(session.userId)?.windowId === event.window_id) {
            params.scheduler.cancel(session.userId);
          }
        });
      }
      const isDurablyActive = await params.windows.isActive(session.userId, event.window_id);
      if (!isDurablyActive) {
        // Desktop can attest immediately after it durably enqueues Window Start
        // but before that Start reaches Runtime. With no known current window,
        // retain the live attestation so onLifecycle can converge after commit.
        return pinned ? rejectedPresence() : acceptedPresence();
      }
      return acceptedPresence(async () => {
        activeFloors.set(session.userId, {
          windowId: event.window_id,
          floor: session.pinnedFloor,
        });
        await params.channel.enqueueCommitted(session.userId, async () => {
          await attemptOpening(session.userId, event.window_id, session.pinnedFloor);
        });
      });
    },

    async onDeliveryAck(session, messageId) {
      if (!supportsCoaching(session)) {
        return;
      }
      await params.channel.enqueueCommitted(session.userId, async () => {
        const state = await params.windows.acknowledgeOpening(session.userId, messageId);
        if (state) {
          clearOpeningRetry(session.userId, state.windowId);
          scheduleState(state);
        }
      });
    },

    onPerception(session, event) {
      if (!event.window_id || !isEligibleSession(session)) {
        return false;
      }
      return params.channel.enqueueBestEffort(session.userId, () =>
        runMonitoring(session.userId, "perception_event", event.window_id),
      );
    },

    onHeartbeat(userId) {
      if (openingRetries.has(userId)) {
        void params.channel
          .enqueueCommitted(userId, () => runScheduledWork(userId))
          .catch(() => {
            const retry = openingRetries.get(userId);
            if (retry) {
              scheduleOpeningRetry(userId, retry.windowId);
            }
          });
        return true;
      }
      return params.channel.enqueueBestEffort(userId, () => runScheduledWork(userId));
    },
  };
}

function acceptedPresence(afterApply?: () => Promise<void>): CoachingPresenceAdmission {
  return {
    accepted: true,
    ...(afterApply ? { afterApply } : {}),
  };
}

function rejectedPresence(): CoachingPresenceAdmission {
  return { accepted: false };
}

function supportsCoaching(session: BoundSession): boolean {
  return session.clientKind === "desktop" && session.capabilities.includes("desktop_coaching_v1");
}
