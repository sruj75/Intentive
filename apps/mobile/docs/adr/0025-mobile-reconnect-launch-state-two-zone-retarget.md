# Reconnect the Launch State seam by re-targeting the router at the two-zone model

Status: accepted; second seam of the approved Mobile integration plan (relaxes ADR 0022 / 0023's fully-unmounted boundary for launch-state navigation only; reconciles ADR 0011's gate topology with ADR 0023's two-zone frontend)

Date: 2026-07-18

## Context

The dormant launch-state stack was built against ADR 0011's **six-gate `(gates)` zone topology**: `route-for-destination.ts` mapped each Launch Destination to its own route (`/(gates)/identity`, `/(gates)/consent`, `/(gates)/invite`, `/(gates)/trial`, `/(onboarding)`, `/(chat)`). The ADR 0023 rebuild replaced that with a **two-zone frontend** — `(onboarding)` (`/`) for the pre-chat funnel and `(main)` (`/chat`) for chat — and collapsed consent / sibling / trial into the single onboarding funnel plus education deck. Those `(gates)` routes no longer exist, so the dormant router was topologically stale, not a drop-in.

The rest of the stack was sound and reusable: the pure `resolveLaunchState` resolver (the faithful gate-ordering projection, with contract tests), the `LaunchStateSource` seam and its real `createControlPlaneLaunchStateSource` (`GET /me` → `mapAccountStateToLaunchState`), and the in-memory `LaunchStateProvider` store. What was missing was a live navigator and a resolved topology. The integration plan flagged this as the thorniest seam and recommended, for v1 simplicity, re-targeting the router at the two-zone model rather than reinstating the `(gates)` zones.

## Decision

**Re-target, don't rebuild.** `route-for-destination.ts`'s `ROUTE_ZONE_FOR` now maps every pre-chat destination (`SIGNED_OUT`, `MISSING_CONSENT`, `MISSING_ONBOARDING`, `SIBLING_INVITATION_PENDING`, `MISSING_TRIAL`) to `/`, and only `READY_FOR_CHAT` to `/chat`. The resolver is left untouched — it stays the honest projection of Control-Plane gate truth; only the router's targets fold to the two zones the frontend actually has. The `(onboarding)` zone's collapsed funnel presents whichever gate is outstanding.

**Launch State owns navigation.** `app/_layout.tsx` mounts `LaunchStateProvider` with `getPlatform().launchStateSource` (the real `GET /me`-backed source) and a `RootNavigator` effect that runs `resolveLaunchState → routeForDestination → router.replace`. A `RESOLVING` state is a splash (no replacement), so the default `/` stays mounted until `GET /me` hydrates. This replaces the old "cold launch always begins at A" rule with gate truth: a signed-out cold launch stays on `/`, a fully-onboarded account is replaced to `/chat`, a mid-funnel account resumes on `/`.

**The two-zone funnel presents and persists the shared gates.** Amended
2026-07-25: folding Control-Plane-owned gates into local completion was not
truthful—the Runtime routing endpoint correctly rejected the resulting session.
The mounted funnel now presents explicit Data & Privacy acceptance, persists it
through `POST /consent`, persists the terminal sibling decision through
`POST /sibling-invitation/skip`, and reconciles with `GET /me` after each write.
`RootNavigator` can cross into `/chat` only after the reconciled projection is
`READY_FOR_CHAT`; failed writes remain on a retryable onboarding scene.

The offline/dev default is preserved: with no injected callbacks, `OnboardingEntry` makes no Launch State calls and navigates locally, which is the path the `experience-journey` invariant test drives.

## Consequences

- The whole launch decision (resolver + routing) stays assertable on the pure node:test path; `route-for-destination.test.mjs` now encodes the two-zone map and the pre-chat fold. The resolver's own contract tests are unchanged.
- `mapAccountStateToLaunchState` already collapses `onboarding` and `trial` to always-completed (the Control Plane cannot yet report them), so in practice only consent and sibling ever block a real signed-in user — both resolve to `/` under the re-target.
- Reinstating a richer gate topology later is a router-map change plus new route
  files; the resolver and durable gate commands remain unchanged.
- The `apps/mobile/CLAUDE.md` "cold launch always begins at A / do not add persistence" rule and the launch-state line of the "zero calls" invariant are relaxed for the live root-layout composition only; the entrypoint default remains capability-free.
