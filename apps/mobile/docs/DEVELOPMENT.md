# Mobile Development

Intentive iOS development uses an **Expo Development Client** in an iOS
Simulator. It does not use Expo Go: Google Sign-In, notifications, SecureStore,
Sentry, updates, and other native modules must exist in the installed binary.

Continuous Native Generation owns the native project through `app.json`,
`app.config.js`, and config plugins. The normal workflow lets EAS generate it in
the cloud; never hand-edit a local `ios/` directory.

## Verify before opening Simulator

Use Node 24 or newer:

```bash
pnpm --dir apps/mobile typecheck
pnpm --dir apps/mobile test
pnpm --dir apps/mobile test:rn --runInBand
pnpm harness --scope apps/mobile
```

`test:rn` passes Jest flags directly; do not add an extra `--`.

## Pick the simulator that exists

Installed runtimes and devices change with Xcode. Discover them every time the
toolchain changes:

```bash
xcrun simctl runtime scan-and-mount
xcrun simctl list runtimes
xcrun simctl list devices available
```

Use one available iPhone at a time. Prefer the lightest installed current device
for daily work and the newest installed runtime for the final simulator smoke.
Never depend on an undefined device variable or a device name that is not in the
current inventory.

```bash
IOS_UDID="<available-device-udid>"
xcrun simctl shutdown all
xcrun simctl boot "$IOS_UDID"
xcrun simctl bootstatus "$IOS_UDID" -b
open "$(xcode-select -p)/Applications/Simulator.app"
```

## Build the development client with EAS

Do not use `expo run:ios`, a local Xcode build, or Expo Go for the normal loop.
The committed `development-simulator` profile extends `development`, sets
`ios.simulator=true`, and uses the EAS `preview` environment. The profile produces
an Intentive-specific debug binary containing `expo-dev-client` and all configured
native modules.

From `apps/mobile`:

```bash
npx -y eas-cli@21.2.0 whoami
npx -y eas-cli@21.2.0 env:list --environment preview
npx -y eas-cli@21.2.0 build \
  --platform ios \
  --profile development-simulator \
  --non-interactive \
  --wait
```

The environment check is a real build precondition. It must list:

- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`;
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`;
- the intended non-production Neon Auth and Control Plane URLs.

Check the actual Neon Auth endpoint before spending time on the browser handoff:

```bash
npx -y eas-cli@21.2.0 env:exec preview \
  'curl -sS -i "$EXPO_PUBLIC_NEON_AUTH_BASE_URL/get-session"'
```

An unauthenticated healthy endpoint responds `200`. `412` with
`COMPUTE_QUOTA_EXCEEDED` is an external Neon account/project quota gate: Google
can issue a valid token while Neon still refuses the exchange. Record the response
and stop the auth run until the quota resets or the Neon plan changes. Do not
misdiagnose this as an Expo, native Google, or callback-scheme failure.

Without the iOS client ID, `app.config.js` deliberately omits the native Google
plugin and URL scheme. Without either client ID, the runtime disables Google.
A successful compile alone is therefore not proof that the auth-capable client
was built.

Install the completed EAS artifact into the already booted simulator:

```bash
npx -y eas-cli@21.2.0 build:run \
  --platform ios \
  --profile development-simulator \
  --latest \
  --simulator "$IOS_UDID"
```

Record the EAS build ID and URL in the handoff. The simulator artifact needs no
Apple signing and cannot be installed on a physical iPhone.

## JS/TS inner loop

Once the dev client is installed, do not rebuild native code for ordinary JS/TS
changes:

```bash
cd apps/mobile
npx -y eas-cli@21.2.0 env:exec preview "pnpm dev"
```

In another terminal:

```bash
xcrun simctl launch booted com.heyintentive.expo
xcrun simctl openurl booted \
  "intentive://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082"
```

Metro must stay on `8082`; `8081` belongs to Agent Runtime internal HTTP.
The `dev` script explicitly passes `--dev-client`; it must not fall back to Expo Go.
`env:exec` is equally important: Metro creates the JavaScript bundle, so it must
receive the same public client IDs and endpoints as the EAS-built native shell.

Create a new EAS development-client build after:

- a native dependency changes;
- a config plugin changes;
- a native `app.json` key changes;
- the Expo/React Native SDK changes;
- icons or splash assets change.

## Local backend

Start the services from the root [Apple development
workflow](../../../docs/DEVELOPMENT.md), then override only the Control Plane URL
inside the `env:exec` command:

```bash
npx -y eas-cli@21.2.0 env:exec preview \
  "EXPO_PUBLIC_CONTROL_PLANE_BASE_URL=http://localhost:8080 pnpm dev"
```

The Simulator shares the Mac network. A physical iPhone must use a reachable Mac
LAN address and transport policy appropriate for that build.

The EAS-built client receives native configuration from the `preview` environment.
Metro can override JavaScript-facing public URLs through `.env.local`, but it
cannot retrofit a missing native Google URL scheme. Changing the iOS client ID
therefore requires another EAS build.

## Live acceptance

After deterministic tests pass:

1. Cold-launch and verify Launch State chooses `/` or `/chat` from real state.
2. Walk the affected portion of the A-L journey in Simulator.
3. Inspect the screen after every action and keep Metro/native logs visible.
4. Background and foreground the app once.
5. Terminate and cold-launch once after the warm reload works.
6. Take a simulator screenshot:

   ```bash
   xcrun simctl io booted screenshot /tmp/intentive-ios.png
   ```

7. Repeat on a physical internal build for Google Sign-In, APNs/push,
   SecureStore/Keychain lifecycle, or background behavior.

Google Sign-In can be exercised in Simulator as a development check when the
client IDs and URL scheme are present. The production-readiness gate remains a
physical internal build because device credentials, browser handoff, Keychain,
push, and lifecycle behavior are not simulator-equivalent.

The Google handoff itself has three separate assertions:

1. the app exposes **Continue with Google**;
2. tapping it opens Apple's native web-auth consent and then
   `accounts.google.com`;
3. Google's page says it is continuing to **Intentive**. A stale product name is
   an OAuth-brand configuration bug and blocks preview approval even when token
   exchange works. Renaming the Google Cloud project is not sufficient; the
   user-facing value is the OAuth app name under
   [Google Auth Platform → Branding](https://support.google.com/cloud/answer/15549049),
   and a verified production brand may require
   [re-verification after a name change](https://support.google.com/cloud/answer/13464018).

Only after those assertions and a healthy Neon endpoint may the run claim the
Google token was exchanged for a Neon session. Then require `getUserJwt()` to
return a User JWT accepted by the Control Plane before calling auth end to end.

XcodeBuildMCP can provide structured simulator/build/log/UI actions. Computer Use
is useful for visual inspection when semantic iOS UI automation is insufficient.
The shell commands above remain the reproducible fallback.

## Stop, reuse, and rebuild

The normal end-of-run command is:

```bash
pnpm development:kill
```

This stops Metro and the local services, terminates the Mobile Client, and shuts
down Simulator. It deliberately does **not** uninstall the EAS development client
or erase the Simulator. It also preserves EAS/local native artifacts,
`node_modules`, and the shared build caches. Intentive-named temporary screenshots
are deleted because they are run evidence, not a reusable native artifact.

Reuse the installed client for every JS/TS-only run. If it needs reinstalling on
this or another Simulator, use the recorded EAS build ID:

```bash
npx -y eas-cli@21.2.0 build:run \
  --platform ios \
  --id "<recorded-eas-build-id>" \
  --simulator "$IOS_UDID"
```

When the native dependency graph, config plugins, native `app.json` values, or
Expo/React Native SDK changes, build a new development client. Let EAS reuse its
native build cache; do not pass `--clear-cache` unless a diagnosed cache defect
requires it. Keep the previous EAS build ID as a rollback artifact.

`pnpm development:clean` remains a compatibility alias for the same cache-safe
kill behavior. `pnpm development:prune` is the explicit opt-in for deleting local
one-run EAS archives and temporary EAS builder directories. Neither command
deletes remote EAS builds, the installed Simulator client, or shared SwiftPM
caches. A local generated `ios/`, Pods, or DerivedData tree is not part of the
normal cloud-EAS workflow.

Preview/TestFlight and production App Store procedures are in
[PREVIEW.md](../../../docs/PREVIEW.md) and [RELEASE.md](RELEASE.md).
