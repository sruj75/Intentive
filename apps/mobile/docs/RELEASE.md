# Mobile Client Release Runbook

How an Intentive iOS build goes from merged `main` to TestFlight / the App Store,
and how a JavaScript change reaches already-installed devices **without a new
binary** via an over-the-air (OTA) update. Releases run on **EAS** (Expo
Application Services), not GitHub Actions — there is no semver tag for this
deployable (`expo.version` stays `0.0.0`); a binary is identified by its EAS build
and an OTA update by its EAS branch.

The Mobile Client is a **view** (see [`../AGENTS.md`](../AGENTS.md)): it persists
nothing durably and the server is truth. OTA only ships the JS bundle and assets —
it never migrates state.

---

## The release shape

There are **two** ways code reaches a device, and which one you can use depends on
**what changed**:

| You changed…                                                                     | Ship via                   | Needs App Store review?      |
| -------------------------------------------------------------------------------- | -------------------------- | ---------------------------- |
| JS / TS, React components, images, most config                                   | **EAS Update** (OTA)       | No                           |
| Native code, a new native module, `app.json` native keys, SDK bump, icons/splash | **EAS Build** (new binary) | Yes (App Store / TestFlight) |

If you are unsure whether a change is "native", it almost certainly is whenever a
**new dependency adds native code** or you touch anything under `ios/`. Native
changes require a new binary; an OTA pushed on top of a stale binary is rejected by
the runtime-version guard (it will simply not be downloaded), so the worst case is
"update silently ignored", not a crash.

**OTA path (EAS Update):**

1. A PR lands on `main`.
2. From `apps/mobile`, `eas update --branch <channel>` publishes the JS bundle to
   that branch.
3. The branch is bound to a build **channel** (`eas.json`), so every installed
   build on that channel and a matching runtime version becomes eligible.
4. Installed apps check on launch (`EXUpdatesCheckOnLaunch=ALWAYS`), download in
   the background, and apply the update on the **next** launch.

**Binary path (EAS Build):**

1. A PR updates the native surface and any release code/docs and merges to `main`.
2. From `apps/mobile`, `eas build --profile production --platform ios` builds and
   signs the binary in EAS cloud.
3. `eas submit --profile production --platform ios` ships it to TestFlight / the
   App Store; Apple review gates external release.
4. Only builds that embed `EXUpdatesEnabled=true` + the update URL can later
   receive OTA updates.

---

## One-time setup

OTA and push are wired across layers that **must all agree**. These are set once;
the in-repo layers are committed, the EAS-side layers live in the Expo project.

**1. `app.json`** (committed)

- `updates.url` → `https://u.expo.dev/<projectId>` (the EAS Update endpoint;
  `projectId` is `extra.eas.projectId`, currently `fd429803-2de2-493f-960f-cdaebdea7714`).
- `runtimeVersion.policy` → `appVersion`. The runtime version is the binary's
  compatibility key: an update is only delivered to a build whose runtime version
  matches the update's. With the `appVersion` policy the runtime version **is**
  `expo.version` (currently `0.0.0`).
- `plugins` includes `expo-notifications` — under CNG this declares the iOS push
  capability and, on a fresh prebuild, writes the APNs entitlement.

**2. `eas.json`** (committed) — each build profile is bound to an update **channel**:

- `production` → channel `production`
- `preview` → channel `preview`
- `development` (dev client) has no channel and runs any compatible update.

A channel points at a branch of published updates; you publish to a branch and map
the channel to it (`eas update --branch <name>`, `eas channel:edit`).

**3. Committed iOS native** (`ios/Intentive/Supporting/Expo.plist`,
`ios/Intentive/Intentive.entitlements`) — because `ios/` is committed (prebuild
output lives in git), EAS Build uses it **as-is** and does not re-run prebuild. The
plist therefore carries the resolved values:

- `EXUpdatesEnabled` → `true`
- `EXUpdatesURL` → the same `u.expo.dev` URL as `app.json`
- `EXUpdatesRuntimeVersion` → `0.0.0` (the resolved `appVersion`)
- `EXUpdatesCheckOnLaunch` → `ALWAYS`, `EXUpdatesLaunchWaitMs` → `0`: check on
  every launch, never block startup. A downloaded update applies on the **next**
  launch.
- `aps-environment` = `development` in the entitlements. EAS Build reconciles this
  against the distribution provisioning profile for store/TestFlight builds; the
  Expo Push Service routes sandbox vs production automatically per token.

**4. EAS credentials** (Expo project, not the repo) — an **APNs push key** must
exist in the project's EAS credentials, or builds raise _"No valid aps-environment
entitlement string found"_ and tokens never deliver. The first
`eas build --profile production --platform ios` provisions it interactively;
inspect/rotate later with `eas credentials`.

**5. Server side** — the Control Plane reads the optional `EXPO_ACCESS_TOKEN` env
var (documented in
[`../../../services/control-plane/README.md`](../../../services/control-plane/README.md));
push works without it but the token is recommended for production. Push tokens and
all provider detail stay in the Control Plane.

---

## Before releasing

Do this from a clean branch and merge through PR. Do not release an unreviewed
local commit.

1. Decide the path from the table above (OTA vs new binary). When in doubt, treat
   it as native.
2. **Keep the runtime-version values in sync.** Because native is committed, three
   values are coupled and must move together: `expo.version` (`app.json`),
   `version` in the binary, and `EXUpdatesRuntimeVersion` (`Expo.plist`). The safe
   way to bump them is to change `expo.version` and run
   `npx expo prebuild -p ios` to regenerate the plist, then commit. If you bump
   `expo.version` without rebuilding the binary, OTA updates published under the new
   runtime version will not reach the old build (by design).
3. If release behavior changed, update [`CHANGELOG.md`](../CHANGELOG.md).
4. Merge the PR to `main` and confirm the commit you intend to ship is on
   `origin/main`:

   ```bash
   git fetch origin main
   git rev-parse origin/main
   ```

5. For a **local** Xcode build only: `expo-updates` and `expo-notifications` are
   dependencies, so run `cd apps/mobile/ios && pod install` first (EAS Build runs
   this automatically).

---

## Release and watch

### Publish an OTA update

```bash
cd apps/mobile

# Ship the current JS to the channel a build is on:
eas update --branch production --message "Fix: <what changed>"

# Or preview first:
eas update --branch preview --message "..."
```

### Cut a new binary (native changes / first OTA-capable build)

```bash
cd apps/mobile
eas build --profile production --platform ios   # or --profile preview
eas submit --profile production --platform ios   # TestFlight / App Store
```

The **first** build after wiring OTA must be a fresh binary — only builds that
embed `EXUpdatesEnabled=true` + the URL can receive updates. Builds shipped before
this change will never see OTA updates.

Watch the work in EAS:

```bash
eas update:list --branch production --limit 3   # OTA publishes
eas build:list --platform ios --limit 3         # binary builds
```

The EAS dashboard (or the URL each command prints) is the source of truth for
build/update status.

---

## Verify the live release

**OTA.** Confirm the update published to the branch the channel points at, then
confirm a real build picks it up:

```bash
eas channel:view production      # channel → branch mapping
eas update:list --branch production --limit 1
```

Installed apps on the matching runtime version pick the update up on their next
launch (check-on-launch is `ALWAYS`); it applies on the launch after that. Verify
on an actual `preview`/`production` build — **OTA never runs in Expo Go or a dev
client** (`Updates.channel` is `null` there).

**Binary.** Confirm the build reached TestFlight and install it from there:

```bash
eas build:list --platform ios --limit 1
```

**Push** only works on a **physical device** with a real build — never in the
simulator, Expo Go, or a dev client (`getExpoPushTokenAsync` is gated on
`Device.isDevice`). End-to-end: the Mobile Client registers an Expo Push Token with
the Control Plane on first chat entry, and the Control Plane delivers through the
Expo Push Service when **Post-Message-Back** fires.

---

## Rollback

**OTA** is reversible without a store trip: republish the last good update so it
becomes the newest on the branch, and devices pick it up on next launch.

```bash
cd apps/mobile
eas update:list --branch production            # find the last good update group
eas update:republish --group <last-good-group> --message "Rollback: <reason>"
```

A bad **binary** cannot be pulled once distributed. If the regression is JS-only,
ship an OTA fix on top (fastest); otherwise cut a new binary and resubmit, which
goes through App Store review again. This is the asymmetry that makes the OTA/binary
decision in _The release shape_ load-bearing.

---

## Ship gate

- **OTA:** shipped once the update is published to the `production` branch and a
  build on the matching runtime version downloads and applies it on next launch.
- **Binary:** shipped once `eas submit` lands the build on TestFlight / the App
  Store and Apple approves external release.

There is no server-side smoke — unlike the Control Plane and Agent Runtime, the
Mobile Client serves nothing; the Expo Push Service and the App Store are the
distribution surfaces. The client stays a view: a shipped release changes what runs
on the device, never what is true on the server.
