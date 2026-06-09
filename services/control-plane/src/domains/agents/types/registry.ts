/**
 * agents domain — Agent Instance Registry shapes. Typed against the shared
 * internal contract so the Session Start request shape (the only Control
 * Plane → Agent Runtime call that creates state) is validated by monorepo
 * typecheck. Behavior (the registry repo + Session Start call) lands in #30.
 */
import type { PostInternalSessionsStartRequest } from "@intentive/api-contract";

export const sessionStartRequestSample: PostInternalSessionsStartRequest = {
  auth_subject: "sub_stub",
  user_id: "user_stub",
};
