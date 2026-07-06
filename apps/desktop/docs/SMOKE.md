# Desktop Smoke

## Local Gates

```bash
pnpm --dir apps/desktop typecheck
pnpm --dir apps/desktop test
pnpm harness --scope apps/desktop
```

## Manual Local Run

```bash
cd apps/desktop/macos
./run.sh
```

Confirm:

1. The app opens to the Intentive Desktop window.
2. `Capture Sample` adds a Screen Memory row and reports a published `perception_event`.
3. `Screen Memory` search finds the captured row by words from the summary.
4. `Floating Chat` accepts a typed message and appends it to the shared-thread preview.
5. `Effects` can trigger a Post-Message-Back nudge without creating a second chat surface.

## Local Stack Smoke

With Control Plane and Agent Runtime running:

1. Sign in through the configured `AuthAdapter`.
2. Call `GET /me` with `X-Client-Kind: desktop` and `X-Capture-Permission-Granted`.
3. Register the device with `POST /devices/register`.
4. Fetch routing from `GET /agent`.
5. Connect the Runtime Bridge and verify `hello_ok`.
6. Send one `perception_event`; verify Agent Runtime writes `runtime_events` and `perception_records`.
7. Send one floating-bar `user_message`; verify it appears in Mobile after reconnect.
8. Trigger one Post-Message-Back reply; verify the Desktop Effect Runner acknowledges it.

## Release Smoke

```bash
CONFIGURATION=release apps/desktop/macos/scripts/build-app-bundle.sh
```

On a signed release candidate, also verify the DMG opens on a clean Mac and the generated `appcast.xml` points at the GitHub Release asset.
