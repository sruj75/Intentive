# Mobile Client Development Runbook

**This is the canonical local development workflow for the Mobile Client.**

When the user tags this doc (e.g. "run the dev workflow", "build the simulator",
"@DEVELOPMENT.md"), the agent should execute the [Agent runbook](#agent-runbook)
below top-to-bottom: produce a **local EAS iOS simulator dev build**, install it on
a booted simulator, start Metro, and launch the dev client — then report back with a
screenshot.

When the user says **"kill it"** (or "tear it down", "clean sweep"), the agent
should execute the [Teardown](#teardown--kill-it) section: a full clean sweep that
leaves **no running server and no on-disk deadweight** behind.

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

Run from the repo root unless a step says otherwise. This runbook is **cache-aware**:
it does the cheapest thing that leaves a dev client running on a booted simulator, so
only the **first** build on a machine costs the full ~10–20 min — every build after
reuses the on-disk cache, and JS/TS-only edits need no build at all.

**Which path?** (see [Build caching](#build-caching--make-rebuilds-fast-cache-not-deadweight) for the why)

- **Dev client already installed on a booted sim + no native change** → don't build;
  jump to step 5 (start Metro + reload). Seconds.
- **First build, or a native change to rebuild** → run the steps below; the build
  itself is `pnpm ios` (step 3), the **cached** in-place build. A "native change" is a
  new native dep, a changed/added config plugin, an `app.json` native key, an SDK
  bump, or icons/splash. First run is cold (~10–20 min); cached and fast every run
  after.

The build step is **`pnpm ios`** (`expo run:ios`) on purpose: it compiles in place
into `apps/mobile/ios/` and **keeps** Pods + Xcode DerivedData + the downloaded RN
xcframeworks between runs, and also installs to the sim and starts Metro. Reach for
`eas build --local` **only** when you need the portable `.tar.gz` — it can't cache
(see [Portable artifact](#portable-artifact-eas-local-build) below).

```bash
# 0. (one-time / when shared contracts change) build the workspace deps Metro needs
pnpm --filter "@intentive/mobile^..." build

# 1. boot a simulator (skip if one is already booted)
xcrun simctl boot "iPhone 16"             # or any available device; UDID also works
open -a Simulator

# 2. generate the native iOS project from app.json (CNG — ios/ is git-ignored, see ADR-0017)
cd apps/mobile
npx expo prebuild -p ios                  # skip if ios/ exists & nothing native changed; --clean forces a regen

# 3. CACHED in-place build + install on the booted sim + start Metro, all in one.
#    Reuses ios/Pods, Xcode DerivedData, and the RN xcframeworks → seconds-to-minutes
#    after the first cold build. bundle id: com.heyintentive.expo
pnpm ios --device "iPhone 16"             # = expo run:ios; --device targets a booted sim by name or UDID

# 4. confirm it rendered
xcrun simctl io booted screenshot /tmp/intentive-sim.png

# --- Dev client already installed and nothing native changed? Skip 0–4; just start
#     Metro and point the client at it — JS/TS hot-reloads, no native build: ---

# 5. start Metro (pnpm ios in step 3 already started it; run this only if it isn't up)
pnpm --dir apps/mobile dev                # = expo start, serves http://localhost:8081

# 6. launch the dev client and point it at Metro
xcrun simctl launch booted com.heyintentive.expo
xcrun simctl openurl booted "intentive://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
```

A successful run shows `iOS Bundled <N>ms … (NNNN modules)` in the Metro log and the
app rendering in the screenshot (behind the dev-menu sheet). Report the screenshot.

> **Why prebuild (step 2)?** The native `ios/` project isn't committed — it's
> generated from `app.json` + config plugins (Continuous Native Generation). Step 2
> materializes it, and `pnpm ios` builds it in place. Once `ios/` exists you can skip
> step 2 unless something native changed. There is no `android/` — this is an iOS-only
> product (see [ADR-0017](adr/0017-mobile-ios-native-via-cng.md)).

### Portable artifact (eas local build)

Only when you need the portable `.tar.gz` (mirror the cloud build, or install it on a
machine that didn't build it) — **not** for day-to-day iteration, because it can't
cache (fresh temp dir every run, always ~10–20 min) and doesn't seed the `pnpm ios`
cache (see [Build caching](#build-caching--make-rebuilds-fast-cache-not-deadweight)):

```bash
# build the portable artifact  →  apps/mobile/build-<ts>.tar.gz
eas build --platform ios --profile development --local --non-interactive
# (if `eas` isn't on PATH, use `npx eas-cli build …` — same flags)

# extract + install onto the booted sim, then start Metro + launch with steps 5–6 above
APP_TGZ=$(ls -t build-*.tar.gz | head -1)
rm -rf /tmp/intentive-app && mkdir -p /tmp/intentive-app
tar -xzf "$APP_TGZ" -C /tmp/intentive-app
xcrun simctl install booted /tmp/intentive-app/Intentive.app   # bundle id: com.heyintentive.expo
```

> **Human shortcut:** `eas build:run -p ios` (after the build above) interactively
> picks a simulator and installs the latest local build for you; then run steps 5–6.
> The explicit `simctl` steps are the deterministic path for agents.

---

## Inner loop (after the first build)

The binary only needs rebuilding when the **native** surface changes (new native
dep, a new/changed config plugin, `app.json` native keys, SDK bump, icons/splash —
same rule as [`RELEASE.md`](RELEASE.md)). For everything else:

- **JS/TS edit** → Metro hot-reloads automatically. Force a reload with
  `xcrun simctl openurl booted "intentive://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"`
  or the dev menu (`Cmd-D` in the simulator → Reload).
- **Changed a shared `@intentive/*` package** → re-run step 0
  (`pnpm --filter "@intentive/mobile^..." build`), then reload Metro.
- **Native change** → `npx expo prebuild -p ios --clean` to regenerate `ios/`, then
  re-run the build from step 3 (`pnpm ios`). Never hand-edit `ios/` — it's regenerated and your
  change will be lost; put native config in `app.json` or a config plugin instead.

---

## Build caching — make rebuilds fast (cache, not deadweight)

A cold native build is 10–20 min because it downloads the React Native prebuilt
xcframeworks (`ReactNativeCore` ~91 MB, `ReactNativeDependencies` ~18 MB, Hermes)
and compiles the from-source Expo precompiled pods (Reanimated, Screens, Worklets,
safe-area-context) and the app. The goal is to pay that **once** and reuse the
outputs — a live **cache**, not [deadweight](#teardown--kill-it).

**`eas build --local` cannot cache across runs — by design.** It builds in a fresh
temp dir that must be empty (the eas-cli `prepareWorkingdirAsync` throws _"Workingdir
is not empty"_), and the log says `[RESTORE_CACHE] Local builds do not support
restoring cache`. So every run re-downloads the frameworks and recompiles from
scratch. `EAS_LOCAL_BUILD_WORKINGDIR` / `EAS_LOCAL_BUILD_SKIP_CLEANUP=1` only move or
keep that dir; they don't let the next run reuse it. **Use `eas build --local` only
when you need the portable `.tar.gz` artifact or want to mirror the cloud build** —
not for iterating.

**For the fast, cached loop, build in place with `npx expo run:ios`** (= `pnpm
ios`). It compiles into `apps/mobile/ios/` and **keeps the outputs between runs**:

- `ios/Pods` persists → CocoaPods reinstalls only what changed.
- Xcode **DerivedData** persists → only changed files recompile (incremental).
- The downloaded RN prebuilt xcframeworks persist in `ios/Pods/*-artifacts/`.
- It also installs to the simulator and starts Metro, like the runbook above.

First `expo run:ios` ≈ the same cold cost; **every native build after that is
seconds-to-minutes.** `pnpm ios` **is** the runbook's build (step 3); step 4 (screenshot) still applies for inspecting the result.

**The biggest cache is the dev client itself.** Once it's installed, JS/TS edits
**never** trigger a native build — Metro hot-reloads them. You only pay a native
build when native deps / config plugins / `app.json` native keys change. So daily:
build natively once with `pnpm ios`, then live in the [inner loop](#inner-loop-after-the-first-build).

**Machine-level caches that persist regardless** (shared by both paths, safe to
keep): the CocoaPods download cache (`~/Library/Caches/CocoaPods`), the Metro
transform cache (`$TMPDIR/metro-*`; clear a poisoned one with `pnpm dev -- -c`), and
the npm/pnpm stores. These are caches — leave them. Only the
[teardown](#teardown--kill-it) list (eas temp copies, `build-*.tar.gz`, `/tmp`
scratch) is deadweight.

> **Cache vs. deadweight, concretely:** `apps/mobile/ios/` + its `Pods` +
> DerivedData are a **cache** — reused on every `pnpm ios`, kept by teardown. The
> `eas build --local` temp dir and `build-*.tar.gz` are **deadweight** — never
> reused, removed by teardown.

---

## Teardown — "kill it"

A **clean sweep**: stop everything this workflow started and delete everything it
wrote, so nothing keeps running and nothing stale is left on disk. Idempotent —
safe to run even if some pieces are already gone. Run from the repo root.

```bash
# 1. stop Metro (free port 8081 + any expo/metro process)
lsof -ti tcp:8081 | xargs kill -9 2>/dev/null
pkill -f "expo start" 2>/dev/null; pkill -f "metro" 2>/dev/null

# 2. terminate + uninstall the app, shut the simulator down, quit the Simulator UI
for D in $(xcrun simctl list devices booted -j | grep -o '"udid" : "[^"]*"' | cut -d'"' -f4); do
  xcrun simctl terminate "$D" com.heyintentive.expo 2>/dev/null
  xcrun simctl uninstall "$D" com.heyintentive.expo 2>/dev/null
done
xcrun simctl shutdown all 2>/dev/null
osascript -e 'tell application "Simulator" to quit' 2>/dev/null

# 3. delete the build artifact(s)
rm -f apps/mobile/build-*.tar.gz

# 4. delete temp scratch (install dir, logs, screenshot, EAS local-build cache)
rm -rf /tmp/intentive-app /tmp/intentive-sim.png /tmp/intentive-metro.log /tmp/eas-*build*.log
rm -rf "${TMPDIR}eas-build-local-nodejs" "${TMPDIR}eas-cli-nodejs"
```

If the agent ran Metro as a backgrounded task (not via `&`), **stop that task**
too — `kill` on port 8081 only catches a foreground/own-shell process.

**Verify the sweep** (every line should report empty/none):

```bash
lsof -ti tcp:8081 || echo "port free ✓"
xcrun simctl list devices booted | grep -i booted || echo "no sims booted ✓"
ls apps/mobile/build-*.tar.gz 2>/dev/null || echo "no artifacts ✓"
ls -d /tmp/intentive-* 2>/dev/null || echo "no temp ✓"
```

**What is intentionally _kept_** (not deadweight — committed config or expensive
regenerable outputs, cheap to reuse vs. costly to rebuild): the `expo-dev-client`
dep, the `app.json` `runtimeVersion`, the `packages/*/dist` workspace builds, and
the generated `apps/mobile/ios/` project (regenerate any time with
`npx expo prebuild -p ios --clean` — but it costs a prebuild + `pod install`, so a
clean sweep leaves it like `node_modules`). A clean sweep removes _runtime +
scratch_, not the repo's committed state or expensive local caches. (`eas build
--local` builds in its own system-temp copy, so there is no
`apps/mobile/ios/build` DerivedData to clear.)

---

## Gotchas (why the config is the way it is)

1. **`expo-dev-client` is required.** The `development` profile in
   [`../eas.json`](../eas.json) sets `developmentClient: true`; without the
   `expo-dev-client` dep the build has no dev-launcher. It is a committed
   dependency — keep it.
2. **Native is generated, not committed (CNG).** `ios/` (and `android/`) are
   git-ignored; `app.json` + config plugins are the single source of truth, and
   `npx expo prebuild` materializes the native project ([ADR-0017](adr/0017-mobile-ios-native-via-cng.md)).
   So **never hand-edit `ios/`** — changes are lost on the next prebuild; add a
   config plugin instead. `app.json` pins a literal `runtimeVersion` (`"0.0.0"`),
   which prebuild writes into `ios/Intentive/Supporting/Expo.plist` as
   `EXUpdatesRuntimeVersion`; bump them together with `expo.version`. (A
   `runtimeVersion` _policy_ also works now that the project is CNG, but the literal
   is kept for deterministic OTA runtime versions — see [`RELEASE.md`](RELEASE.md).)
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
