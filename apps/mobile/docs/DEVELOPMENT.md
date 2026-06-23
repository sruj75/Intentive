# Mobile Client Development Runbook

**This is the canonical local development workflow for the Mobile Client.**

When the user tags this doc (e.g. "run the dev workflow", "build the simulator",
"@DEVELOPMENT.md"), the agent should execute the [Agent runbook](#agent-runbook)
below top-to-bottom: produce a **local EAS iOS simulator dev build**, install it on
a booted simulator, start Metro, and launch the dev client — then report back with a
screenshot.

This is the **inner loop** for day-to-day work: a debug **dev client** (Expo
dev-launcher + dev-menu) that loads JS from a local Metro server, so JS/TS changes
hot-reload without rebuilding the binary. It is **not** the release path — for
TestFlight / App Store / OTA see [`RELEASE.md`](RELEASE.md). For headless
verification conventions (DerivedData wipes, visual checks) see
[`../../docs/TESTING.md`](../../docs/TESTING.md#ios-simulator-verification-visual-on-device).

Builds run **locally on the Mac** via `eas build --local` (Xcode + fastlane) — no
EAS cloud, and simulator builds need **no Apple credentials**.

---

## Agent runbook

Run from the repo root unless a step says otherwise. This is the exact sequence,
with the commands that are known to work.

```bash
# 0. (one-time / when shared contracts change) build the workspace deps Metro needs
pnpm --filter "@intentive/mobile^..." build

# 1. produce the local simulator dev build  →  apps/mobile/build-<ts>.tar.gz
cd apps/mobile
eas build --platform ios --profile development --local --non-interactive

# 2. boot a simulator (skip if one is already booted)
xcrun simctl boot "iPhone 16"        # or any available device; UDID also works
open -a Simulator

# 3. install the freshly built app onto the booted simulator
APP_TGZ=$(ls -t build-*.tar.gz | head -1)
rm -rf /tmp/intentive-app && mkdir -p /tmp/intentive-app
tar -xzf "$APP_TGZ" -C /tmp/intentive-app
xcrun simctl install booted /tmp/intentive-app/Intentive.app   # bundle id: com.heyintentive.expo

# 4. start Metro (leave running; backgrounded by the agent)
pnpm dev                                  # = expo start, serves http://localhost:8081

# 5. launch the dev client and point it at Metro
xcrun simctl launch booted com.heyintentive.expo
xcrun simctl openurl booted "intentive://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"

# 6. confirm it rendered
xcrun simctl io booted screenshot /tmp/intentive-sim.png
```

A successful run shows `iOS Bundled <N>ms … (NNNN modules)` in the Metro log and the
app rendering in the screenshot (behind the dev-menu sheet). Report the build
artifact path and the screenshot.

> **Human shortcut:** `eas build:run -p ios` (after step 1) interactively picks a
> simulator and installs the latest local build for you; then run steps 4–5. The
> explicit `simctl` steps above are the deterministic path for agents.

---

## Inner loop (after the first build)

The binary only needs rebuilding when the **native** surface changes (new native
dep, `ios/` edits, SDK bump, icons/splash — same rule as
[`RELEASE.md`](RELEASE.md)). For everything else:

- **JS/TS edit** → Metro hot-reloads automatically. Force a reload with
  `xcrun simctl openurl booted "intentive://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"`
  or the dev menu (`Cmd-D` in the simulator → Reload).
- **Changed a shared `@intentive/*` package** → re-run step 0
  (`pnpm --filter "@intentive/mobile^..." build`), then reload Metro.
- **Native change** → re-run the full runbook from step 1.

---

## Gotchas (why the config is the way it is)

1. **`expo-dev-client` is required.** The `development` profile in
   [`../eas.json`](../eas.json) sets `developmentClient: true`; without the
   `expo-dev-client` dep the build has no dev-launcher. It is a committed
   dependency — keep it.
2. **Bare workflow needs a literal `runtimeVersion`.** Because `ios/` and
   `android/` are committed, this is a **bare** project, and EAS rejects a
   `runtimeVersion` _policy_. `app.json` pins the literal `"0.0.0"`, matching
   `ios/Intentive/Supporting/Expo.plist` → `EXUpdatesRuntimeVersion`. Keep them in
   sync. (`expo-doctor` also reports the bare native-folders + `app.json` props
   mismatch and `newArchEnabled` — expected for a bare project; the local build
   proceeds anyway.)
3. **Build workspace deps before bundling.** `@intentive/protocol` and
   `@intentive/api-contract` resolve through `exports → dist/index.js`. If those
   `dist/` outputs are missing, Metro fails with _"Unable to resolve
   @intentive/protocol"_. Step 0 builds them. (A harmless require-cycle warning in
   `packages/protocol` remains in the Metro log.)

---

## Notes

- **Env:** the `development` EAS environment has no env vars, so Sentry stays
  disabled in dev builds (the `preview` environment carries the
  `EXPO_PUBLIC_SENTRY_DSN`). Local `.env` still loads `EXPO_PUBLIC_*` for Metro.
- **Artifacts:** `apps/mobile/build-*.tar.gz` (~300 MB) is git-ignored.
- On `clang` / `swift-frontend` crashes during a native build, wipe DerivedData and
  rebuild — see [`../../docs/TESTING.md`](../../docs/TESTING.md#ios-simulator-verification-visual-on-device).
