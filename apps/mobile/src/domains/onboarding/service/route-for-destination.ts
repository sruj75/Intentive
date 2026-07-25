/**
 * Launch Route — the route intent a Launch Destination maps to. The second half
 * of the launch decision: the resolver answers *where the user stands* (a
 * `LaunchDestination`); this pure module answers *where that sends them* — either
 * the splash (`RESOLVING`, state not yet known) or a route replacement to exactly one
 * route zone.
 *
 * Pure: `LaunchDestination → LaunchRoute`, no I/O, no React, no router package
 * import (the route target is a plain route path). The root layout's
 * `RootNavigator` runs the intent — replaces to the route target when needed,
 * nothing on a splash. Splitting this out of the layout makes the whole launch
 * decision (resolver + routing) assertable on the pure node:test path; the layout
 * keeps only the effect. See apps/mobile/CONTEXT.md (Launch Route) and ADR 0025.
 *
 * Topology: the two-zone frontend (ADR 0023) has exactly two navigation zones —
 * `(onboarding)` (`/`) and `(main)` (`/chat`) — so the six-gate `(gates)` map
 * from ADR 0011 is re-targeted here (ADR 0025): every pre-chat destination lands
 * on `/`, where the collapsed onboarding funnel presents whichever gate is
 * outstanding, and only `READY_FOR_CHAT` crosses into `/chat`.
 */
import type { LaunchDestination } from "../../../providers/launch-state/types.js";

/**
 * The route intent for one Launch Destination: stay on the splash while state is
 * still resolving, or replace into a concrete route path (`zone` is the path
 * string the layout hands to `router.replace`).
 */
export type LaunchRoute = { kind: "splash" } | { kind: "replace"; zone: string };

const ROUTE_ZONE_FOR: Record<Exclude<LaunchDestination, "RESOLVING">, string> = {
  SIGNED_OUT: "/",
  MISSING_CONSENT: "/",
  MISSING_ONBOARDING: "/",
  SIBLING_INVITATION_PENDING: "/",
  MISSING_TRIAL: "/",
  READY_FOR_CHAT: "/chat",
};

/** Map a Launch Destination to its Launch Route. */
export function routeForDestination(destination: LaunchDestination): LaunchRoute {
  if (destination === "RESOLVING") return { kind: "splash" };
  return { kind: "replace", zone: ROUTE_ZONE_FOR[destination] };
}
