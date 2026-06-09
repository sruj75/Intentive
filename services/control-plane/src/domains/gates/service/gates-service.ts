/**
 * Gates service — the gates domain's narrow decision surface.
 *
 * It exposes exactly what its two callers need: the `identity` composer asks
 * `nextGate(userId)` for the `AccountState` projection (ADR-0004), and the
 * `/consent` and `/sibling-invitation/skip` handlers record completions. It
 * holds no I/O (the repo does that) and no gate ordering (`computeNextGate`
 * does that) — it just binds the stored state to the sequencer and forwards
 * writes, so it tests with a plain fake repo and no database.
 */
import type { PreChatGateKind } from "@intentive/api-contract";

import type { UserGatesRepo } from "../repo/user-gates.js";
import { computeNextGate } from "./compute-next-gate.js";

export interface GatesService {
  /** The next cross-client gate for `userId`, or `null` if none remain. */
  nextGate(userId: string): Promise<PreChatGateKind | null>;
  /** Record Consent Primer completion (idempotent). */
  recordConsent(userId: string): Promise<void>;
  /** Record Sibling Invitation resolution/skip (idempotent). */
  recordSiblingSkip(userId: string): Promise<void>;
}

export function createGatesService(deps: { userGates: UserGatesRepo }): GatesService {
  return {
    async nextGate(userId) {
      return computeNextGate(await deps.userGates.readState(userId));
    },
    recordConsent(userId) {
      return deps.userGates.recordConsent(userId);
    },
    recordSiblingSkip(userId) {
      return deps.userGates.recordSiblingSkip(userId);
    },
  };
}
