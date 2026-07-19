/**
 * Feature access — the pure gate from Control Plane account state (`GET /me`) to
 * the Companion capabilities the chat surface may offer. Kept in the account
 * service layer next to `account-status` so all account-derived affordances read
 * from one place (ADR-0027).
 *
 * Proactive suggestions are a Companion capability, so they require a provisioned
 * Agent Runtime instance. A `null` projection — the capability-free offline
 * default, a signed-out read, or the pre-hydration window — grants access so the
 * local experience is unchanged; only a real signed-in account without a
 * provisioned Companion (`has_agent_instance: false`) has the affordance gated off.
 */
import type { AccountState } from "@intentive/api-contract";

export interface FeatureAccess {
  /** Whether the chat surface may render proactive suggestion groups. */
  readonly proactiveSuggestions: boolean;
}

export function deriveFeatureAccess(account: AccountState | null): FeatureAccess {
  if (account === null) return { proactiveSuggestions: true };
  return { proactiveSuggestions: account.has_agent_instance };
}
