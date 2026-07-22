# Reconnect the Auth seam via a composition root

Status: accepted; first seam of the approved Mobile integration plan (relaxes ADR 0022 / 0023's fully-unmounted boundary for authentication only)

Date: 2026-07-18

## Context

ADR 0022 and ADR 0023 shipped a local-only demo frontend whose production integrations were preserved as dormant, wired-and-tested source behind injectable seams. The approved integration plan reconnects those seams one at a time. Auth is the keystone: it establishes the **composition root** — the single place adapters are constructed with real platform capabilities (Neon Auth client, global `fetch`, telemetry, EAS config) — and it produces the **User JWT** token-getter every later seam consumes.

The dormant auth domain already existed: the **Auth Adapter** (four methods over the **Auth Provider** selection and the User JWT, ADR 0012), the RN-free `NeonAuthClientPort`, and the launch-only `__DEV__` dev provider. Capability honesty was already the adapter's job — a provider not in the enabled set short-circuits to `not-configured` rather than opening a dead OAuth flow. What was missing was a composition root to build it and a live mount point for the Identity Gate.

## Decision

Add a composition root under `src/entrypoints/`:

- `runtime-config.ts` reads the public build seams from `EXPO_PUBLIC_*` env (Control Plane base URL, Sentry DSN, and Google iOS OAuth client ID; the Neon Auth base URL remains read inside `neon-client.ts`) plus `expo-constants` and `__DEV__`. Blank values keep a seam dormant.
- `platform.ts` (`getPlatform()`) constructs the Neon client, the Auth Adapter, the shared `fetch`, telemetry, and the `getUserJwt` token-getter once, behind a lazily-built singleton. Imported only by `app/` route files and other entrypoints — never by domains (layer rule: entrypoints compose).

Mount the real adapter at the Identity Gate. `AuthScene` presents two options — **Apple** and **Google** — and each button names the Auth Provider it should try (`onSignIn("apple" | "google")`). The `(onboarding)` route injects `getPlatform().auth`; `OnboardingEntry` advances to the personalization journey only on a real `signed-in` outcome. `cancelled`, `not-configured`, and `error` leave the user on the gate, and the adapter captures failures into telemetry.

Keep the local stand-in as the injectable default: with no `authAdapter` prop, `OnboardingEntry` advances with zero capability calls. That offline path is what the `experience-journey` invariant test drives, so the "zero auth calls" guarantee still holds for the demo/dev path while the route composes the live one.

## Native Google follow-on

The browser-redirect Google path was blocked by Neon Auth's managed trusted-origin rules. The native path now initializes `GoogleSignin` inside `neon-client.ts`, maps native cancellation/failure, obtains the ID/access-token pair, calls `authClient.signIn.social({ provider: "google", idToken: { token, accessToken } })`, and requires `getSession()` confirmation before returning `signed-in`. Better Auth and SecureStore remain the session owners, and the shared `getUserJwt()` seam is unchanged.

The `@react-native-google-signin/google-signin` Expo config plugin adds the reversed iOS client-ID scheme while retaining `intentive`. This is a native dependency/config change and requires a new iOS binary. Supplying `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` is the deliberate internal-build gate: it installs the plugin and enables Google so the managed Neon provider configuration can be proven on physical TestFlight hardware.

## Consequences

- The composition root exists for every later seam (launch state, chat runtime, account state, notifications, telemetry) to consume the same base URL, `getUserJwt`, `fetch`, and telemetry instance.
- Without the public iOS client ID, Apple and Google report `not-configured`; with it, only Google is enabled for the internal TestFlight proof. Apple remains unconfigured. The dev provider stays `__DEV__`-only and is no longer reachable from a button — it is exercised via injection.
- The A-scene snapshot changed by exactly the Google label and its `continue-with-google` test ID; the Phone option is retired.
- The `apps/mobile/CLAUDE.md` "zero auth calls" invariant is relaxed for the live route composition only; the entrypoint default remains capability-free.
