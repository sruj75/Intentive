# Reconnect the Account State seam for feature gating

Status: accepted; fourth seam of the approved Mobile integration plan (relaxes ADR 0022 / 0023's fully-unmounted boundary for account-state feature gating only; shares the `GET /me` seam introduced by ADR 0025)

Date: 2026-07-19

## Context

The chat surface offers proactive suggestion groups, gated today by a local UI toggle only (`AccountSettingsBoundary`'s `proactiveSuggestions`, default on). The dormant Account State provider (`providers/account-state/*`) can read real Control Plane account state via `createControlPlaneAccountStateSource` (`GET /me` → `AccountState = { user_id, next_gate, has_agent_instance, has_desktop_client }`) and hold it in the transient `useAccountStateProjection`, but nothing mounted consumes it. Launch State (ADR 0025) already reads `GET /me` at cold launch; wiring account state naively would build that read a second time.

## Decision

**Mount the projection at the `(main)` route; keep the entrypoint default offline.** Following the Seam 1–3 pattern, `ChatEntry` grows an optional `accountStateSource` prop and calls `useAccountStateProjection(accountStateSource)`. With no injected source (the offline default the `experience-journey` invariant test drives) the projection is `null` and makes zero calls. The `(main)/chat.tsx` route injects `getPlatform().accountStateSource`.

**Gate the affordance through a pure service.** `account/service/feature-access.ts` (`deriveFeatureAccess`) maps `AccountState | null` to the capabilities the surface may offer. Proactive suggestions are a Companion capability, so they require a provisioned Agent Runtime instance (`has_agent_instance`). A `null` projection grants access, so the offline/local experience and all 19 snapshots are unchanged; only a real signed-in account without a provisioned Companion has the affordance gated off. `ChatEntry` renders the suggestion groups when `proactiveSuggestions && featureAccess.proactiveSuggestions` — the user toggle stays UI-owned, the account gate narrows it.

**Dedupe the `GET /me` seam by sharing one source.** The composition root builds a single `accountStateSource` and injects it into `createControlPlaneLaunchStateSource` (now accepting an optional `accountStateSource`, defaulting to constructing its own so standalone/test call sites are unchanged). Launch State and the account projection therefore read through one Account State Source instead of two.

## Consequences

- The gate is unit-tested on the pure node:test path (`feature-access.test.mjs`); the existing account-state-projection RN test and the launch-source test stay green (the launch-source change is backward compatible). Snapshots are untouched because the default projection keeps the gate open.
- **Request-level coalescing is deliberately deferred.** Sharing the source instance centralizes the seam but does not collapse the two network reads, which happen at different lifecycle points (cold-launch navigation vs. opening the chat surface) where account state may legitimately have changed. A caching/TTL layer would make `refreshAccountState` stale for no v1 benefit, so it is out of scope.
- **`account/service/account-status.ts` stays parked.** It derives a connection-status label but has no mounted surface; rendering it would add UI the preserve-visuals invariant forbids in this seam. Its reconnection waits on a design task, same as Seam 3's error affordance.
- Only `has_agent_instance` is consumed for gating today; `has_desktop_client` (Mac-setup promotion) and `next_gate` remain available for later affordances without another seam.
- The `apps/mobile/CLAUDE.md` "zero HTTP / Control Plane calls" invariant line is relaxed for the live `(main)` route composition only; the `ChatEntry` entrypoint default remains capability-free.
