# Reconnect the Notifications seam for push registration

Status: accepted; fifth seam of the approved Mobile integration plan (relaxes ADR 0022 / 0023's fully-unmounted boundary for device push registration only)

Date: 2026-07-19

## Context

The dormant Notifications domain (`notifications/**`, six files) can already request permission (`expo-notifications-port.ts`), compute a stable device fingerprint (`device-fingerprint.ts`), resolve the EAS project id (`expo-project-id.ts`), and register the device with the Control Plane (`register-device.ts` → `POST /devices/register` → `{ device_id }`), orchestrated by the pure `registerForPush` service. All six compile and are unit-tested (`push-registration.test.mjs`, `register-device.test.mjs`), but nothing mounted invokes them, so a signed-in client never registers for push. The `expo-notifications` plugin and `eas.projectId` are already declared in `app.json`.

## Decision

**Compose the runner in the composition root; mount it from the `(main)` layout, gated on a signed-in state.** `platform.ts` grows a `registerForPush()` method that assembles the real dependencies — the Expo notifications port, `getOrCreateDeviceFingerprint`, the shared Control Plane `baseUrl` / `getUserJwt` / `fetch`, and an `onError` that reports to telemetry — and calls the dormant `registerForPush` service. The `(main)` zone is only reached signed in, so its layout is the seam point: it renders a new `NotificationsRegistrar` entrypoint beside the chat `Stack`, passing `signedIn={state.signedIn === true}` from Launch State and the module-level `registerForPush` reference.

**Register once per session, off an effect.** `NotificationsRegistrar` renders nothing and runs a single attempt in a `useEffect` guarded by a ref: permission is a terminal user decision and a successful register is idempotent server-side, so it never re-prompts. With no injected `register` (the offline default the `experience-journey` invariant test drives) it makes zero calls; a denial, an unavailable simulator, or a missing User JWT resolves to a terminal/retryable result without a crash and without navigation change.

**Keep the module-level factory reference.** `const registerForPush = () => getPlatform().registerForPush()` is defined at module scope in `(main)/_layout.tsx` so the registrar's effect dependency is stable across renders — a fresh arrow each render would re-arm the one-shot attempt.

## Consequences

- The service and Control Plane request stay unit-tested on the pure node:test path (unchanged); the new composition is a thin effect over already-tested code. No snapshots change — the registrar renders `null` and the offline default makes no calls, so `experience-journey` and the RN router-boundary tests are untouched.
- **No in-app retry surface.** A `retryable` result (transient register failure, no token yet) is dropped for v1: the effect runs once and telemetry captures the error. A deliberate re-registration affordance (e.g. on a later cold launch or a settings toggle) waits on a design task, consistent with the deferred affordances in Seams 3–4.
- Push token *rotation* (`subscribeToPushTokenChanges`) is available on the port but not yet wired; a rotated token re-registers on the next signed-in session, which is sufficient for v1.
- The `apps/mobile/CLAUDE.md` offline-default invariant is relaxed so notification-permission and the `POST /devices/register` call are permitted on the live `(main)` route composition only; the entrypoint defaults remain capability-free.
