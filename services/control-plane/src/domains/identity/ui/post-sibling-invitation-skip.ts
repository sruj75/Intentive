/**
 * `POST /sibling-invitation/skip` handler — the HTTP boundary for recording that
 * the Sibling Invitation gate is resolved (skipped), cross-client.
 *
 * Identical in shape to the consent handler: authenticate via the shared
 * `requireUser`, record the gate for that user (idempotent in the repo), and
 * validate the request and response at the boundary.
 */
import { PostSiblingInvitationSkipRequest, parseBoundary } from "@intentive/api-contract";

import { requireUser, type Authenticator } from "../../../http/auth.js";
import { siblingSkipAccepted } from "./ack.js";

export interface PostSiblingInvitationSkipRequestHttp {
  /** Raw `Authorization` header value, or null when absent. */
  authorization: string | null;
  /** Parsed JSON request body (validated here at the boundary). */
  body: unknown;
}

export interface PostSiblingInvitationSkipResult {
  status: number;
  body: unknown;
}

export interface PostSiblingInvitationSkipHandler {
  handle(req: PostSiblingInvitationSkipRequestHttp): Promise<PostSiblingInvitationSkipResult>;
}

export function createPostSiblingInvitationSkipHandler(deps: {
  identity: Authenticator;
  gates: { recordSiblingSkip(userId: string): Promise<void> };
}): PostSiblingInvitationSkipHandler {
  return {
    async handle({ authorization, body }) {
      const auth = await requireUser(authorization, deps.identity);
      if (!auth.ok) return auth.response;

      parseBoundary(PostSiblingInvitationSkipRequest, body ?? {});
      await deps.gates.recordSiblingSkip(auth.userId);
      return { status: 200, body: siblingSkipAccepted() };
    },
  };
}
