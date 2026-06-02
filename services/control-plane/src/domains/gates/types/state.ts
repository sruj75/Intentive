/**
 * gates domain — Pre-Chat Gate state shapes. Typed against the shared API
 * contract so the `GET /me` Account State projection, the next-gate enum, and
 * the cross-client write requests (consent, sibling-invitation skip) are
 * validated by monorepo typecheck. Behavior (cross-client vs device-local gate
 * sequencing, `/me` shaping, idempotent writes) lands in #26.
 */
import type {
  GetMeResponse,
  PostConsentRequest,
  PostSiblingInvitationSkipRequest,
  PreChatGateKind,
} from "@intentive/api-contract";

export const nextGateSample: PreChatGateKind = "consent_primer";

export const accountStateSample: GetMeResponse = {
  user_id: "user_stub",
  next_gate: nextGateSample,
  has_agent_instance: false,
};

export const consentRequestSample: PostConsentRequest = {};

export const siblingInvitationSkipRequestSample: PostSiblingInvitationSkipRequest = {};
