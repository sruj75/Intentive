/**
 * gates domain — Pre-Chat Gate state shapes. Typed against the shared HTTP
 * contract so the `GET /me` Account State projection, the next-gate enum, and
 * the cross-client write requests (consent, sibling-invitation skip) are
 * validated by monorepo typecheck.
 */
import type {
  GetMeResponse,
  PostConsentRequest,
  PostSiblingInvitationSkipRequest,
  PreChatGateKind,
} from "@intentive/api-contract";

/**
 * One user's recorded cross-client gate completion, reduced to the two booleans
 * `computeNextGate` reasons over. This is the gates domain's *own* view of gate
 * state — deliberately not the storage shape (timestamps live in the repo) and
 * not the wire shape (`AccountState` is composed elsewhere). Device-local gates
 * (#27) are absent because they are not cross-client state.
 */
export interface GateState {
  /** Has the Consent Primer been completed (on any client)? */
  consentCompleted: boolean;
  /** Has the Sibling Invitation been skipped (or otherwise resolved)? */
  siblingSkipped: boolean;
}

export const nextGateSample: PreChatGateKind = "consent_primer";

export const accountStateSample: GetMeResponse = {
  user_id: "user_stub",
  next_gate: nextGateSample,
  has_agent_instance: false,
};

export const consentRequestSample: PostConsentRequest = {};

export const siblingInvitationSkipRequestSample: PostSiblingInvitationSkipRequest = {};
