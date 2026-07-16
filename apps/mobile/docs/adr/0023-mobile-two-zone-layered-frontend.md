# Two-zone layered Mobile frontend

Status: accepted; supersedes ADR 0022's one-controller composition and ADR 0021's retired design-guide authority

Date: 2026-07-16

## Context

ADR 0022 correctly established the Huracán A–L visuals, one E/K conversation surface, UI-owned Conversation Timeline Items, deterministic local behavior, and an unmounted production boundary. It incorrectly placed authentication, onboarding, education, chat, account settings, overlays, profile state, content, theme, and timers behind one catch-all controller outside the layered domains.

That directory sat outside the Mobile Client's layered domains, so the architecture linter did not evaluate its layer direction or cross-domain ownership. The result was a useful pile of frontend parts but not the repository's intended `types → config → repo → service → runtime → ui` assembly.

## Decision

Use two headerless Expo Router zones: `(onboarding)` serves `/` for A–D and `(main)` serves `/chat` for E–L. They are navigation zones, not business domains. B2, K2, Education Deck pages, F/G overlays, and L1–L4 remain local state.

Assign behavior to the `auth`, `onboarding`, `chat`, and `account` domains. Share only the non-durable name and initials through `providers/profile`. Put global theme, brand identity, and prop-only primitives in `design`. Use `entrypoints` for cross-domain composition and Router replacement only.

Replace the global controller with explicit seams:

- `OnboardingJourneyController` owns B–D validation and transitions.
- `EducationDeckController` owns slide navigation, skip, completion, and reset.
- `ConversationSession` exposes `getSnapshot`, `subscribe`, `send`, and `dispose`; its local runtime implementation owns deterministic cancellable timers.
- `ProfileStore` exposes `getSnapshot`, `subscribe`, `setName`, and `reset` with no persistence.

Add a hard Mobile source-structure lint rule. Only `domains`, `providers`, `entrypoints`, `design`, and `index.ts` may sit under `src/`; only the canonical layers plus explicit domain-local `providers` may sit directly under a domain.

Keep all production auth, Control Plane, notification, telemetry, and Agent Runtime integrations unmounted. Preserve the A–L output, copy, interactions, test IDs, and 19 snapshots.

## Consequences

- The filesystem now exposes responsibility and dependency direction instead of hiding it behind a phase directory.
- Router and DDD axes remain orthogonal: navigation can change without redefining domains.
- Local behavior can be replaced one adapter at a time without reconnecting production systems or rewriting UI.
- Cold launch still starts at A, logout resets profile state, and no Mobile persistence is introduced.
- Future unknown `src/` roots and domain layers fail lint instead of receiving the architecture parser's benefit of the doubt.
- ADR 0022 remains the rationale for the preserved frontend behavior, but its single-controller composition is superseded.
- ADR 0021 remains historical rationale for a retired presentation; its former DESIGN.md authority is superseded by this architecture contract and domain-owned configuration.
