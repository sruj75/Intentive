# Reconnect the Telemetry seam (Sentry)

Status: accepted; sixth and final seam of the approved Mobile integration plan (relaxes ADR 0022 / 0023's fully-unmounted boundary for telemetry only)

Date: 2026-07-19

## Context

The dormant Telemetry provider (`providers/telemetry/*`) wraps `@sentry/react-native` behind the app's own `Telemetry` port: `initTelemetry(config)` (no-op on a blank DSN), `createSentryTelemetry()` (returns `noopTelemetry` until init), and `wrapRoot(Component)` (Sentry's error/performance wrapper, identity until init). The `@sentry/react-native/expo` plugin is already declared in `app.json`.

The composition root already did most of this seam's work in Seam 0: `platform.ts` calls `initTelemetry({ dsn, environment })` as it builds and injects the resulting `createSentryTelemetry()` instance into the auth and runtime adapters (and now the notifications runner) in place of their `noopTelemetry` defaults. What remained unmounted was the root wrap: nothing called `wrapRoot`, so uncaught render errors and performance spans never reached Sentry.

## Decision

**Wrap the root component in `app/_layout.tsx`.** The root layout now `export default wrapRoot(RootLayout)`. Because `wrapRoot` only wraps once Sentry is initialized, the module touches the composition root at load time (`getPlatform()` at module scope) so `initTelemetry` has run before `wrapRoot` is evaluated. A blank DSN keeps `initTelemetry` a no-op and `wrapRoot` returns `RootLayout` unchanged, so nothing is instrumented off the offline/dev path.

**No new injection.** The adapter-level capture path was already live via the composition root; this seam adds only the root boundary. Config still comes from `EXPO_PUBLIC_SENTRY_DSN` / environment through `runtime-config.ts`, per the config-source decision recorded in that file.

**Leave the `MOBILE_WORKSPACE_READY` marker parked.** `src/index.ts` and `account/types/workspace.ts` are an orphaned build-readiness marker, not a production seam. They have no external referrers (`main` is `expo-router/entry`, not this barrel) and cause no harm; deleting them is cosmetic and outside this seam's telemetry concern. They stay as-is, to be revisited in a dedicated cleanup task rather than removed here.

## Consequences

- With all six seams reconnected, the offline default (no DSN, no injected adapters) still makes zero telemetry/auth/HTTP/WebSocket calls — the `experience-journey` invariant test and all 19 snapshots are preserved because `wrapRoot` is the identity function without a DSN and the RN tests exercise the entrypoints, not the `app/_layout.tsx` route.
- Sentry now sees uncaught render errors and, per its Expo integration, performance/session data governed by the `enableAutoSessionTracking: false` init. Device verification: throw a test error and confirm it surfaces in Sentry with the seam tags the adapters already attach.
- This is the terminal seam of the integration plan; the `apps/mobile/CLAUDE.md` "telemetry until its seam lands" carve-out in the offline-default invariant is now removed, leaving the offline default as the sole remaining zero-call path.
