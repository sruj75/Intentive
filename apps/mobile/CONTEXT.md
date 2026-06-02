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

**Auth Adapter**:
The single boundary the **Identity Gate** calls to obtain or drop a session — `signIn` / `signOut`. It hides which **Auth Provider** answered; nothing else in the Mobile Client imports an auth SDK. A deep module: a tiny interface over a volatile decision (which provider, what token shape). See [`adr/0012`](docs/adr/0012-mobile-auth-adapter-with-dev-provider.md).
_Avoid_: auth client, login service, OAuth wrapper

**Auth Provider**:
A concrete implementation behind the **Auth Adapter**. v1 has two: the **Neon Auth** provider (real Google/Apple sign-in, yields a verifiable **User JWT**, and owns its own session persistence), and the **Dev Auth Provider** (`__DEV__`-only, flips `signedIn` with no verifiable token). The Dev Auth Provider is launch-only — it unblocks gate/UI work without a backend, and cannot ship to production.
_Avoid_: identity provider (reserve that phrasing for Neon Auth itself)

**User JWT**:
The Neon Auth-issued token the **Neon Auth** provider returns on sign-in — the credential later passed through to `GET /me` and the Agent Runtime WebSocket, verified everywhere against the one shared Neon Auth JWKS (see root `CONTEXT-MAP.md`). The Mobile Client never mints or verifies it. The **Dev Auth Provider** does not produce one.
_Avoid_: session token, access token, runtime token

## Relationships

- The **Launch State Resolver** reads **Launch State** and returns one **Launch Destination**.
- A gate screen completing writes its **Gate Status** into **Launch State**; the root layout reactively redirects via the resolver. Gate screens never navigate forward themselves.
- **Pre-Chat Gate** ordering (Identity → Consent → Sibling Invitation → Chat) lives only inside the resolver.
- The **Identity Gate** calls the **Auth Adapter**; on success it writes `signedIn` into **Launch State** (the seam #18 left) and never navigates forward itself.
- The **Auth Adapter** selects an **Auth Provider**; only the **Neon Auth** provider yields a **User JWT**. Verifying that **User JWT** is the Control Plane's job (#23), not the Mobile Client's.
