/**
 * `computeNextGate` — the cross-client Pre-Chat Gate sequencer.
 *
 * Given a user's recorded gate state, returns the next gate the client must
 * clear before chat, or `null` when none remain. The order is fixed: Consent
 * Primer first, then Sibling Invitation. This is the one place that knows the
 * cross-client gate *sequence*; the service, repo, and HTTP layers stay ignorant
 * of ordering and just feed it state.
 *
 * It never returns `identity`: that gate is owned by the auth boundary (you are
 * not an authenticated caller until the JWT verifies), so by the time we have a
 * `userId` to compute gates for, identity is already cleared (ADR-0004).
 * Device-local gates (capture permission, #27) are out of scope here — they are
 * not cross-client state and need the device principal.
 */
import type { PreChatGateKind } from "@intentive/api-contract";

import type { GateState } from "../types/state.js";

export function computeNextGate(state: GateState): PreChatGateKind | null {
  if (!state.consentCompleted) return "consent_primer";
  if (!state.siblingSkipped) return "sibling_client_invitation";
  return null;
}
