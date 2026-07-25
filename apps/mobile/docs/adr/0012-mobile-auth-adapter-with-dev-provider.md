# Identity Gate signs in through an Auth Adapter with a launch-only Dev Provider

The **Identity Gate** (#19) obtains a session only through a single **Auth Adapter** (`signIn` / `signOut`) that hides which **Auth Provider** answered. v1 ships two providers: a real **Neon Auth** provider (Google/Apple, yielding a verifiable **User JWT** and owning its own session persistence) and a **Dev Auth Provider** that is `__DEV__`-gated and launch-only — it flips `signedIn` in the in-memory **Launch State** without producing a verifiable token. On success the gate writes `signedIn` into Launch State (the seam #18 left) and never navigates forward itself.

**Considered Options**

- Launch-only dev fallback behind the adapter (chosen): the dev provider just exercises the `markSignedIn` seam so #20/#21 gate work proceeds with no backend. Matches incremental-MVP scope (ADR 0003) and the pragmatic-over-defensive stance.
- Real-token dev account (dev login signs into a real Neon Auth test user so the token is verifiable downstream). Rejected for #19: it pre-builds #23's job (verifying the token against a live Control Plane / WebSocket) before those doors exist.
- Inline stub in the screen (what #18 left). Rejected: tactical; leaks the sign-in decision into UI and gives nothing to swap a real provider into.

**Consequences**

- Real Neon Auth Google/Apple sign-in can land in #19 because it does not depend on the Control Plane; if OAuth credentials are not yet registered the adapter falls back gracefully to "not configured" so the issue is never blocked on an Apple Developer / Google console account.
- The Dev Auth Provider produces no **User JWT**; it cannot open the real doors (`GET /me`, the Agent Runtime WebSocket). Real-token verification is deferred to #23, which upgrades the dev path against a live backend.
- Session persistence is owned by the Neon Auth SDK, not hand-rolled. This does not contradict ADR 0011 ("the client persists nothing to disk"), which governs **Pre-Chat Gate** state, not the auth session.
- The Auth Adapter hides the **User JWT**: `signIn` reports only success/failure to the screen and never hands the token to UI. A token-getter is added when #33 (the WebSocket client) needs it. The adapter also exposes `signOut()`, but #19 ships no sign-out UI — the **Account Surface** (#46) owns that surface.
- Auth failure stays on the Identity Gate as a recoverable retry: user-cancel returns silently, network/provider errors show a plain retry, and a provider with no credentials surfaces a dev-visible "not configured" state rather than a fake success.
- The Auth Adapter exposes `restoreSession()`, but #19 does not wire it to cold launch. Calling it on boot and mapping the result into Launch State is the **Launch State Source**'s job, which becomes real in #23. #19 proves only in-session sign-in. The shipped "stay signed in across restarts" behavior is still preserved because the Neon Auth SDK persists the session for free.
- #19 does not touch the **Launch State Resolver**; it only writes `signedIn`.
- Mobile uses Better Auth's client directly with the Expo plugin (`@better-auth/expo`, SecureStore + deep-link) pointed at the Neon Auth base URL — not neon-js's React-DOM adapter the Desktop Client uses — because the Expo plugin owns native session persistence. Google authentication uses `@react-native-google-signin/google-signin` for the native prompt and passes its ID/access-token pair to Better Auth's `idToken` branch; the Auth Adapter confirms `getSession()` before reporting success. The existing `intentive` application scheme remains available for ordinary app deep links, but Google sign-in does not return through an `intentive://` OAuth callback.
- **Native Google enablement is gated by build configuration.** Supplying `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` installs the native config plugin and enables Google in that build so an internal TestFlight binary can exercise the real exchange. Apple remains disabled. External distribution still requires the physical-device proof that a Google-issued iOS token creates a Neon session and yields a User JWT accepted by the Control Plane.
