/**
 * gates domain — Pre-Chat Gate state shapes. Typed against the shared HTTP
 * contract so the `GET /me` Account State projection, the next-gate enum, and
 * the cross-client write requests (consent, sibling-invitation skip) are
 * validated by monorepo typecheck.
 */
import type {
  ClientKind,
  GetMeResponse,
  PostConsentRequest,
  PostSiblingInvitationSkipRequest,
  PreChatGateKind,
} from "@intentive/api-contract";

/**
 * One user's recorded cross-client gate completion, reduced to the two booleans
 * `computeNextGate` reasons over. This is the gates domain's *own* view of gate
 * state — deliberately not the storage shape (timestamps live in the repo) and
 * not the wire shape (`AccountState` is composed elsewhere). Cross-client only:
 * the device-aware inputs live in `DeviceGateContext`.
 */
export interface GateState {
  /** Has the Consent Primer been completed (on any client)? */
  consentCompleted: boolean;
  /** Has the Sibling Invitation been skipped (or otherwise resolved)? */
  siblingSkipped: boolean;
}

/**
 * The per-request device-aware inputs the `identity` composer supplies to gate
 * computation (control-plane ADR-0005). The composer reads them from the
 * `GET /me` device signal and the Device Registry; `gates` never reaches into
 * `devices` itself. Every field is optional so the sequencer stays total over
 * partial information: an unregistered/legacy caller reports none, and a missing
 * field means "this gate is not satisfied by that path" (e.g. absent
 * `hasSiblingDevice` is treated as no connected sibling).
 */
export interface DeviceGateContext {
  /** The calling client's kind, from the device signal. Absent → cross-client-only sequence. */
  clientKind?: ClientKind;
  /** Desktop's live macOS capture-permission status, from the device signal. */
  capturePermissionGranted?: boolean;
  /** Does the User own a device of a *different* `client_kind` (a connected sibling)? Composer-derived. */
  hasSiblingDevice?: boolean;
}

/** The full input to `computeNextGate`: recorded cross-client state plus the device context. */
export type GateInputs = GateState & DeviceGateContext;

export const nextGateSample: PreChatGateKind = "consent_primer";

export const accountStateSample: GetMeResponse = {
  user_id: "user_stub",
  next_gate: nextGateSample,
  has_agent_instance: false,
};

export const consentRequestSample: PostConsentRequest = {};

export const siblingInvitationSkipRequestSample: PostSiblingInvitationSkipRequest = {};
