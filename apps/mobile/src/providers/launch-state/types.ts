/**
 * Launch State — shared cross-cutting types for the Mobile Client's launch flow.
 *
 * These live under `src/providers/` (not a domain) because both the `auth`
 * domain (Identity Gate writes `signedIn`) and the `onboarding` domain
 * (Consent / Sibling Invitation write their `GateStatus`) read and write the
 * same in-memory Launch State. A shared store inside a single domain would be a
 * cross-domain import, which the architecture lint forbids. The Launch State
 * Resolver (the gate ordering) stays in `onboarding/service/` and imports these
 * types from here.
 *
 * Launch State is an in-memory projection of Control-Plane-owned Pre-Chat Gate
 * truth — see apps/mobile/docs/adr/0011-*. The client persists nothing durably.
 */

/**
 * The state of a single Pre-Chat Gate. Uniform across all gates, though only
 * the skippable Sibling Client Invitation ever takes `skipped`. Both
 * `completed` and `skipped` let the resolver advance past a gate.
 */
export type GateStatus = "pending" | "completed" | "skipped";

/**
 * What the client currently knows about the user's launch position. Each field
 * is `null` while its answer is genuinely unknown — token not yet read, or the
 * Control Plane's `GET /me` not yet returned. A `null` on a gate the resolver
 * needs to check yields `RESOLVING` (splash).
 *
 * `onboarding` is the one-time personalization funnel (name → acquisition source
 * → grant permissions), collapsed into a single gate because those steps never
 * independently re-trigger — see apps/mobile/docs/adr/0019-*. `trial` is the Free
 * Trial gate, its own gate because entitlement re-checks on expiry (lapsed users
 * see it again, subscribers never do). The three re-triggerable gates —
 * `consent`, `siblingInvitation`, `trial` — stay distinct; the funnel collapses.
 */
export interface LaunchState {
  signedIn: boolean | null;
  consent: GateStatus | null;
  onboarding: GateStatus | null;
  siblingInvitation: GateStatus | null;
  trial: GateStatus | null;
}

/**
 * The resolver's single output. `RESOLVING` means state is not yet known and
 * the root layout shows the splash — so the resolver owns the splash decision
 * too, not the layout.
 */
export type LaunchDestination =
  | "RESOLVING"
  | "SIGNED_OUT"
  | "MISSING_CONSENT"
  | "MISSING_ONBOARDING"
  | "SIBLING_INVITATION_PENDING"
  | "MISSING_TRIAL"
  | "READY_FOR_CHAT";
