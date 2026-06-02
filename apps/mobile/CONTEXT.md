# Mobile Client

The iOS Expo application — the chat surface. For monorepo-wide vocabulary and the context map, read the root [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md). This file captures vocabulary specific to the Mobile Client.

## Language

**Mobile Client**:
The iOS Expo application at `apps/mobile/`.
_Avoid_: Expo, mobile surface, the mobile app

**Launch State Resolver**:
The single deep function that maps the current **Launch State** to one **Launch Destination**. It owns the entire **Pre-Chat Gate** ordering for the client; gate screens never decide what comes next.
_Avoid_: router guard, auth gate, redirect helper

**Launch State**:
The single **in-memory** store the **Launch State Resolver** reads — a transient _projection_ of the Control-Plane-owned **Pre-Chat Gate** truth, used only to drive navigation on this device. The client owns no durable gate state and persists nothing to disk; cold launch starts empty (→ `RESOLVING`) and hydrates from the source. Fields are nullable: a field is `null` while its answer is still unknown (token not yet read, `GET /me` not yet returned). Hydrated/reconciled by **Launch State Source**; a gate completing updates it optimistically. In v1 the durable source is the Control Plane's `GET /me` (post-#23); until then it is fixture-fed. See [`adr/0011`](docs/adr/0011-mobile-launch-state-as-in-memory-projection-of-cp-gate-truth.md).
_Avoid_: session state, app state, local gate store

**Launch State Source**:
The interface that hydrates and reconciles **Launch State** from the durable source of truth. #18 ships a swappable stub; #23 plugs in the real `GET /me` implementation. It writes _into_ the store; the resolver and layout never read it directly.
_Avoid_: gate repo, me-client

**Launch Destination**:
The resolver's output — exactly one of `RESOLVING`, `SIGNED_OUT`, `MISSING_CONSENT`, `SIBLING_INVITATION_PENDING`, `READY_FOR_CHAT`. `RESOLVING` means state is not yet known and the root layout shows the splash — so the resolver owns the splash decision too, not the layout. The root layout redirects to the matching route zone.
_Avoid_: screen, page, next step

**Gate Status**:
The state of a single **Pre-Chat Gate**: `pending | completed | skipped`. Uniform across all gates, though only the skippable **Sibling Client Invitation** ever takes `skipped`. Both `completed` and `skipped` let the resolver advance past a gate.
_Avoid_: done flag, gate boolean

## Relationships

- The **Launch State Resolver** reads **Launch State** and returns one **Launch Destination**.
- A gate screen completing writes its **Gate Status** into **Launch State**; the root layout reactively redirects via the resolver. Gate screens never navigate forward themselves.
- **Pre-Chat Gate** ordering (Identity → Consent → Sibling Invitation → Chat) lives only inside the resolver.
