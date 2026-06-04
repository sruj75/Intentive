/**
 * Launch Route — the route intent a Launch Destination maps to. The second half
 * of the launch decision: the resolver answers *where the user stands* (a
 * `LaunchDestination`); this pure module answers *where that sends them* — either
 * the splash (`RESOLVING`, state not yet known) or a redirect to exactly one
 * route zone.
 *
 * Pure: `LaunchDestination → LaunchRoute`, no I/O, no React, no expo-router
 * import (the href is a plain route-zone string). The root layout's
 * `RootNavigator` runs the intent — `router.replace(route.href)` on a redirect,
 * nothing on a splash. Splitting this out of the layout makes the whole launch
 * decision (resolver + routing) assertable on the pure node:test path; the layout
 * keeps only the effect. See apps/mobile/CONTEXT.md (Launch Route) and ADR 0011.
 */
import type { LaunchDestination } from "../../../providers/launch-state/types.js";

/**
 * The route intent for one Launch Destination: stay on the splash while state is
 * still resolving, or redirect to a concrete route zone.
 */
export type LaunchRoute = { kind: "splash" } | { kind: "redirect"; href: string };

const HREF_FOR: Record<Exclude<LaunchDestination, "RESOLVING">, string> = {
  SIGNED_OUT: "/(gates)/identity",
  MISSING_CONSENT: "/(gates)/consent",
  SIBLING_INVITATION_PENDING: "/(gates)/invite",
  READY_FOR_CHAT: "/(chat)",
};

/** Map a Launch Destination to its Launch Route. */
export function routeForDestination(destination: LaunchDestination): LaunchRoute {
  if (destination === "RESOLVING") return { kind: "splash" };
  return { kind: "redirect", href: HREF_FOR[destination] };
}
