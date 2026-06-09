/**
 * `computeNextGate` — the device-aware Pre-Chat Gate sequencer.
 *
 * Given a user's recorded cross-client state plus the calling device's context
 * (ADR-0005), returns the next gate the client must clear before chat, or `null`
 * when none remain. The order is fixed: Consent Primer → Sibling Invitation →
 * (Desktop only) Capture Permission Setup. This is the one place that knows the
 * gate *sequence*; the service, repo, and HTTP layers stay ignorant of ordering
 * and just feed it inputs. It remains a pure function with no I/O — the composer
 * gathers the inputs (including the cross-domain device read) and passes them in.
 *
 * Two device-aware rules:
 *  - The Sibling Invitation resolves on *either* an explicit skip *or* an
 *    observed sibling device (`hasSiblingDevice`) — connecting your Mac clears
 *    the Mobile prompt with no client write (#21, ADR-0005).
 *  - `capture_permission_setup` is the device-local tail of the sequence and
 *    appears only for a Desktop that does not currently report the macOS grant.
 *    Mobile never reaches it.
 *
 * It never returns `identity`: that gate is owned by the auth boundary (you are
 * not an authenticated caller until the JWT verifies), so by the time we have a
 * `userId` to compute gates for, identity is already cleared (ADR-0004).
 */
import type { PreChatGateKind } from "@intentive/api-contract";

import type { GateInputs } from "../types/state.js";

export function computeNextGate(inputs: GateInputs): PreChatGateKind | null {
  if (!inputs.consentCompleted) return "consent_primer";
  if (!(inputs.siblingSkipped || inputs.hasSiblingDevice)) return "sibling_client_invitation";
  if (inputs.clientKind === "desktop" && !inputs.capturePermissionGranted) {
    return "capture_permission_setup";
  }
  return null;
}
