/**
 * Acknowledgement bodies for the idempotent cross-client gate-write endpoints.
 *
 * Both `POST /consent` and `POST /sibling-invitation/skip` answer an accepted
 * (or idempotently re-applied) write with `{ ok: true }`. Owning both acks here
 * keeps that single "the gate write was accepted" shape in one module —
 * validated against each endpoint's response contract at the boundary — instead
 * of re-asserting the literal in every handler.
 */
import {
  PostConsentResponse,
  PostSiblingInvitationSkipResponse,
  parseBoundary,
} from "@intentive/api-contract";

export function consentAccepted(): PostConsentResponse {
  return parseBoundary(PostConsentResponse, { ok: true });
}

export function siblingSkipAccepted(): PostSiblingInvitationSkipResponse {
  return parseBoundary(PostSiblingInvitationSkipResponse, { ok: true });
}
