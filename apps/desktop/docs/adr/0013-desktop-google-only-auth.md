# ADR 0013: Google is the only Desktop Auth Provider

## Status

Accepted. The Desktop counterpart to mobile ADR 0030
(`apps/mobile/docs/adr/0030-mobile-google-only-production-auth.md`), which made the
same decision for the Mobile Client on 2026-07-23.

## Context

The Omi-derived sign-in screen offered two buttons, "Sign in with Apple" and "Sign in
with Google". Only the second one ever worked. Apple was presented in the UI but was
never wired to a working Apple identity: the app never used
`ASAuthorizationAppleIDProvider`, and Neon Auth had no Apple provider configured. The
`com.apple.developer.applesignin` entitlement was inherited from Omi in the debug build
and requested a capability the app did not exercise; the release entitlements already
omitted it.

Two problems followed from carrying the unfinished option:

1. **The parameterless default selected Apple.** `NeonAuthProvider.signIn()` was
   implemented as `try await signIn(provider: .apple)`. Every code path that did not
   explicitly name a provider — restore-and-connect fallbacks, and any future caller
   reaching for the obvious no-argument method — asked the hosted page for the provider
   that did not work.

2. **A `provider:` parameter threaded through five layers.** `SignInView` →
   `IntentiveDesktopPresentationAdapter` → `MainWindowView` → `DesktopRuntimeSession` →
   `NeonAuthProvider`, each carrying a two-case enum, several as a second overload beside
   an otherwise identical parameterless one. Two enums (`IntentiveAuthProvider` at the UI
   boundary and `DesktopAuthProvider` in core) existed solely to be translated into each
   other.

Finishing Apple sign-in was not worth the cost. Removing it collapses all of the above.

## Decision

- **Google is the only Auth Provider on Desktop.** The Apple button, both provider enums,
  every `provider:` parameter and overload, and the `com.apple.developer.applesignin`
  entitlement are removed rather than parked. The auth interface is `signIn()` with no
  argument, matching Mobile.

- **The hosted URL always requests `provider=google`, and that fact lives in exactly one
  place.** `NeonAuthProvider.hostedSignInURL(state:)` unconditionally appends the query
  item. Callers do not choose and cannot choose. Omitting the parameter instead would make
  the Neon Auth hosted page render its own provider picker — a one-option list — adding a
  screen and a click for no choice, and diverging from Mobile, which reaches Google
  directly through the native SDK.

- **`AuthenticationServices` stays.** `ASWebAuthenticationSession` is the generic OAuth
  host browser that carries the Google flow and the `intentive-desktop://auth/callback`
  redirect. It is not Apple ID sign-in and is unaffected by this decision.

## Consequences

- The sign-in screen has one button. `DesktopRuntimeSession.signInAndConnect()` and
  `MainWindowView.signInAndConnectRuntime()` each lost a redundant overload; the
  `DesktopAuthError.missingToken → markSignedOut()` behavior is preserved.
- The accidental Apple default is gone. `AuthControlPlaneTests.testHostedSignInAlwaysRequestsGoogleProvider`
  is the standing regression guard: it calls the parameterless `signIn()` and asserts the
  started URL carries `provider=google`.
- No server, contract, or schema change. Identity was already provider-agnostic:
  `control_plane.users.sub` is untyped `text`, there is no provider column, enum, or check
  constraint, and the shared JWKS verifier in `packages/providers` never inspected the IdP.
  No migration and no data backfill.
- No user migration: no account was ever created through Apple, so there is nothing to
  relink.
- Reintroducing Apple later is a Neon Auth dashboard change plus one line in
  `hostedSignInURL`, not a re-threading of a parameter through the client.
