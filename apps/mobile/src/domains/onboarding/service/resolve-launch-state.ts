/**
 * Launch State Resolver — the single deep module that owns the Pre-Chat Gate
 * ordering for the whole Mobile Client. Pure: `LaunchState → LaunchDestination`,
 * no I/O, no React, no `auth` import (the signed-in bit arrives as plain input).
 *
 * It is a guard chain evaluated in gate order, short-circuiting at the first
 * gate that is either failing or not yet knowable:
 *
 *   1. not signed in            → SIGNED_OUT      (ignores unknown later gates —
 *                                                  GET /me can't run without a
 *                                                  session, so we never wait on it)
 *   2. a gate we must check is
 *      still unknown (null)     → RESOLVING       (show splash)
 *   3. consent not done         → MISSING_CONSENT
 *   4. sibling invite pending   → SIBLING_INVITATION_PENDING
 *   5. otherwise                → READY_FOR_CHAT
 *
 * `completed` and `skipped` are equivalent for advancing past a gate; only
 * `pending` blocks. See apps/mobile/docs/ARCHITECTURE.md (Launch State Resolver)
 * and apps/mobile/CONTEXT.md.
 */
import type { LaunchDestination, LaunchState } from "../../../providers/launch-state/types.js";

/** A gate is satisfied (advance past it) when it is completed or skipped. */
function isDone(status: LaunchState["consent"]): boolean {
  return status === "completed" || status === "skipped";
}

export function resolveLaunchState(state: LaunchState): LaunchDestination {
  // 1. Identity gate first, and short-circuit: a signed-out user is sent to
  //    sign in regardless of (unknowable) downstream gate state.
  if (state.signedIn === false) return "SIGNED_OUT";
  if (state.signedIn === null) return "RESOLVING";

  // Signed in. From here we need the gate fields; a needed-but-unknown gate
  // means we are still loading.
  if (state.consent === null) return "RESOLVING";
  if (!isDone(state.consent)) return "MISSING_CONSENT";

  if (state.siblingInvitation === null) return "RESOLVING";
  if (!isDone(state.siblingInvitation)) return "SIBLING_INVITATION_PENDING";

  return "READY_FOR_CHAT";
}
