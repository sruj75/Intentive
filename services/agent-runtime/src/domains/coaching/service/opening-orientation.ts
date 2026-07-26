import type { Logger } from "@intentive/providers/telemetry";
import { createNoopLogger } from "@intentive/providers/telemetry";

import type { PinnedProcedureFloor } from "../../bundles/types/floor.js";
import type { ConversationRepo } from "../../conversation/types/conversation.js";
import type { DeliveryPort } from "../../delivery/types/delivery.js";
import type { Turn } from "../../runtime/types/turn.js";
import type { BootstrapLifecycle } from "../../sessions/types/bootstrap.js";
import type { CoachingWindowsRepo } from "../types/coaching.js";

export interface OpeningOrientation {
  run(userId: string, windowId: string, floor: PinnedProcedureFloor): Promise<boolean>;
}

export function createOpeningOrientation(params: {
  readonly bootstrap: Pick<BootstrapLifecycle, "prepareOpening">;
  readonly windows: Pick<
    CoachingWindowsRepo,
    "claimOpening" | "markOpeningReadyQuery" | "releaseOpeningQuery" | "isActive"
  >;
  readonly conversation: Pick<ConversationRepo, "appendQuery">;
  readonly deliveryPort: DeliveryPort;
  readonly turn: Turn;
  readonly isEligible: (userId: string) => boolean;
  readonly isActivelyAttested: (userId: string, windowId: string) => boolean;
  readonly logger?: Logger;
  readonly clock?: () => number;
}): OpeningOrientation {
  const logger = params.logger ?? createNoopLogger();
  const clock = params.clock ?? Date.now;
  return {
    async run(userId, windowId, floor) {
      const startedAt = clock();
      if (!params.isEligible(userId) || !params.isActivelyAttested(userId, windowId)) {
        return false;
      }

      const opening = await params.windows.claimOpening(userId, windowId);
      if (!opening) {
        return false;
      }
      logger.info("coaching.orientation_attempt", {
        user_id: userId,
        status: "started",
      });
      const logFailure = () => {
        logger.warn("coaching.orientation_delivery", {
          user_id: userId,
          message_id: opening.messageId,
          status: "failed",
          duration_ms: clock() - startedAt,
        });
      };

      let body = opening.body;
      if (body === null) {
        const bootstrap = await params.bootstrap.prepareOpening(userId);
        const evidenceVersion = `opening:${windowId}`;
        const output = await params.turn({
          userId,
          threadId: userId,
          body: "Open this Desktop Coaching Window. Welcome the user naturally, help them articulate one Important Outcome, and end with one concise question.",
          trigger: "opening_orientation",
          ...(bootstrap.firstRun ? { firstRun: true } : {}),
          windowId,
          evidenceVersion,
          floor: () => Promise.resolve(floor),
          beforeCommit: async () =>
            params.isEligible(userId) &&
            params.isActivelyAttested(userId, windowId) &&
            (await params.windows.isActive(userId, windowId)),
          onSuccess: (result) => {
            if (result.reply.trim().length === 0) {
              throw new Error("Opening Orientation requires a non-empty reply");
            }
            const queries = [
              params.conversation.appendQuery({
                userId,
                messageId: opening.messageId,
                author: "companion",
                body: result.reply,
                viaPostMessageBack: true,
                windowId,
              }),
              params.windows.markOpeningReadyQuery(userId, windowId),
            ];
            const bootstrapTransition = bootstrap.transitionOnSuccessQuery();
            if (bootstrapTransition) {
              queries.push(bootstrapTransition);
            }
            return queries;
          },
          onFailure: () => ({
            queries: [params.windows.releaseOpeningQuery(userId, windowId)],
            rethrow: false,
          }),
        });

        if (!output) {
          logFailure();
          return false;
        }

        // Read the committed canonical row back through the trusted ready
        // projection. A user row that already owns the stable ID makes both
        // the companion insert and ready transition no-ops, so it can never be
        // surfaced as an Opening Orientation on this attempt or a retry.
        const committed = await params.windows.claimOpening(userId, windowId);
        if (
          !committed ||
          committed.userId !== userId ||
          committed.windowId !== windowId ||
          committed.messageId !== opening.messageId ||
          committed.body === null
        ) {
          logFailure();
          return false;
        }
        body = committed.body;
      }

      const delivered = await params.deliveryPort.deliverCoachingProactive({
        userId,
        messageId: opening.messageId,
        body,
        windowId,
      });
      if (!delivered) {
        logFailure();
        return false;
      }
      logger.info("coaching.orientation_delivery", {
        user_id: userId,
        message_id: opening.messageId,
        status: "ok",
        duration_ms: clock() - startedAt,
      });
      return true;
    },
  };
}
