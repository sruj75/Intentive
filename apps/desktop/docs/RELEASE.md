# Desktop Release Runbook

How an Intentive macOS build goes from merged `main` to a notarized DMG in users'
hands. This is the release-identity smoke required by ADR-0015 and the updater
round-trip required by ADR-0024.

Distinct from [`SMOKE.md`](SMOKE.md), which is the _capture-session_ smoke (does capture work when signed in with all three grants). This doc is the _release_ smoke (is the shipped artifact trustworthy, correctly identified, and self-updating).

---

## The release shape

There is one desktop release path:

1. A PR updates the Desktop version and any release code/docs.
2. The PR merges to `main`.
3. A `desktop-vX.Y.Z` tag is pushed at the exact `main` commit.
4. `.github/workflows/desktop-release.yml` builds the Apple Silicon release,
   deep-signs bundled native artifacts, notarizes and staples the app + DMG,
   generates updater artifacts, verifies the release contract, and uploads the
   four GitHub Release assets.
5. The downloaded GitHub Release DMG is smoke-tested before the landing-page
   download link is flipped.

Expected Release assets:

- `Intentive_X.Y.Z_aarch64.dmg`
- `Intentive.app.tar.gz`
- `Intentive.app.tar.gz.sig`
- `latest.json`

The workflow's `Verify release artifacts` step is load-bearing. It verifies the
same contract future releases need: no Git LFS pointer binaries, real Mach-O
native resources, complete hidden helper-bundle identity (plist + Intentive icon),
Developer ID + hardened runtime on nested binaries, stapled app and DMG tickets,
Gatekeeper acceptance, and updater metadata/signature consistency.

---

## One-time setup

These are credential steps only the owner can do. None are committed to the repo; all secrets live in GitHub Actions secrets.

1. **Apple Developer ID Application cert** — already held: `Developer ID Application: Srujan Gowda (24D6NXS6H7)`, valid to 2030. Export it from Keychain Access → right-click the cert → **Export** _with its private key_ → `.p12` with a password.
2. **App-specific password** — appleid.apple.com → Sign-In & Security → App-Specific Passwords. Used by `notarytool`.
3. **Tauri updater key** — `pnpm tauri signer generate` (run once). Keep the private key + passphrase backed up out of band (losing it strands the installed base — ADR-0024). Paste the **public** key into `tauri.conf.json` at `plugins.updater.pubkey`. The private key becomes the `TAURI_SIGNING_PRIVATE_KEY` secret below.
4. **Desktop Sentry project** — project `hypermind-project-sh/desktop` owns webview
   and Rust errors for the Desktop Client (ADR-0025). Its DSN is public and goes
   in the GitHub variable below; source-map upload uses the private
   `SENTRY_AUTH_TOKEN` secret.
5. **Set GitHub Actions secrets** (repo → Settings → Secrets and variables → Actions):

   | Secret                               | Value                                  |
   | ------------------------------------ | -------------------------------------- |
   | `APPLE_DEVELOPER_ID_CERT`            | `base64 -i cert.p12` output            |
   | `APPLE_DEVELOPER_ID_CERT_PASSWORD`   | the `.p12` password                    |
   | `KEYCHAIN_PASSWORD`                  | any random string                      |
   | `APPLE_ID`                           | `22btrsn071@gmail.com`                 |
   | `APPLE_APP_SPECIFIC_PASSWORD`        | from step 2                            |
   | `APPLE_TEAM_ID`                      | `24D6NXS6H7`                           |
   | `TAURI_SIGNING_PRIVATE_KEY`          | from step 3                            |
   | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | step 3 passphrase                      |
   | `SENTRY_AUTH_TOKEN`                  | Sentry token with release upload scope |

6. **Set GitHub Actions variables**:

   | Variable             | Value                                   |
   | -------------------- | --------------------------------------- |
   | `DESKTOP_SENTRY_DSN` | DSN from `hypermind-project-sh/desktop` |

---

## Before tagging

Do this from a clean branch and merge through PR. Do not tag an unreviewed local
commit.

1. Update `version` in `apps/desktop/src-tauri/tauri.conf.json`.
2. If release behavior changed, update `apps/desktop/docs/CHANGELOG.md`.
3. Verify native release resources locally:

   ```bash
   apps/desktop/scripts/verify-release-artifacts.sh source
   ```

   This catches the easy release blockers before GitHub Actions: missing
   executables, incomplete helper-bundle identity, Git LFS pointer files, or
   non-Mach-O native resources.

4. Open and merge the PR to `main`.
5. Confirm the merged commit on `origin/main` is the commit you want to ship:

   ```bash
   git fetch origin main
   git rev-parse origin/main
   ```

---

## Tag and publish

Replace `0.1.0` with the version in `tauri.conf.json`.

```bash
VERSION=0.1.0
git fetch origin main
git switch main
git pull --ff-only origin main
git tag "desktop-v$VERSION"
git push origin "desktop-v$VERSION"
```

If you are in a Conductor workspace where switching branches is inconvenient,
tag the fetched commit directly:

```bash
VERSION=0.1.0
git fetch origin main
git tag "desktop-v$VERSION" origin/main
git push origin "desktop-v$VERSION"
```

Watch the release run:

```bash
gh run list --repo sruj75/Intentive --workflow desktop-release.yml --limit 3
gh run view <run-id> --repo sruj75/Intentive --json status,conclusion,url,jobs
```

The run must end with `conclusion: success`. The important steps are:

- `Verify native release resources`
- `Deep-sign nested helper + ollama (inside-out)`
- `Build webview with Sentry release metadata`
- `Inject Sentry source-map debug IDs`
- `Stage Sentry source maps outside bundled dist`
- `Build, sign, and notarize`
- `Notarize and staple DMG`
- `Generate updater latest.json`
- `Verify release artifacts`
- `Upload DMG + updater artifacts to GitHub Release`
- `Create Sentry release and upload webview source maps`

`Verify release artifacts` also fails if `.map` files are present inside the
packaged `Intentive.app`; source maps must be uploaded from the staged runner
directory, not shipped in the DMG.

If the workflow fails after a tag push, fix the problem in a PR, merge it, then
move the same tag only after confirming the fix is on `origin/main`:

```bash
VERSION=0.1.0
git fetch origin main
git tag -f "desktop-v$VERSION" origin/main
git push --force origin "desktop-v$VERSION"
```

Only force-move a desktop release tag while the release is still being prepared
and the broken artifact has not been sent to users.

---

## Verify the GitHub Release

Check that GitHub has the expected assets:

```bash
VERSION=0.1.0

gh release view "desktop-v$VERSION" \
  --repo sruj75/Intentive \
  --json tagName,targetCommitish,isDraft,isPrerelease,publishedAt,assets,url
```

Then download the published bytes and run the same bundle contract locally:

```bash
VERSION=0.1.0

rm -rf .context/release-smoke
mkdir -p .context/release-smoke

gh release download "desktop-v$VERSION" \
  --repo sruj75/Intentive \
  --pattern "Intentive_${VERSION}_aarch64.dmg" \
  --pattern "Intentive.app.tar.gz" \
  --pattern "Intentive.app.tar.gz.sig" \
  --pattern "latest.json" \
  --dir .context/release-smoke \
  --clobber

mkdir -p .context/release-smoke/bundle/dmg .context/release-smoke/bundle/macos
cp ".context/release-smoke/Intentive_${VERSION}_aarch64.dmg" .context/release-smoke/bundle/dmg/
cp .context/release-smoke/Intentive.app.tar.gz .context/release-smoke/bundle/macos/
cp .context/release-smoke/Intentive.app.tar.gz.sig .context/release-smoke/bundle/macos/
cp .context/release-smoke/latest.json .context/release-smoke/bundle/macos/
tar -xzf .context/release-smoke/bundle/macos/Intentive.app.tar.gz \
  -C .context/release-smoke/bundle/macos

GITHUB_REF_NAME="desktop-v$VERSION" \
  apps/desktop/scripts/verify-release-artifacts.sh bundle .context/release-smoke/bundle
```

Pass means the published updater app and DMG satisfy the signed-release contract.

---

## Clean-Mac smoke

You do **not** need a second Mac or a fresh user account. These commands reproduce a virgin first-launch on your own Mac. Run against the DMG downloaded from the GitHub Release, installed to `/Applications/Intentive.app`.

### 1. DMG and app trust verdict

```bash
VERSION=0.1.0
DMG="$PWD/.context/release-smoke/Intentive_${VERSION}_aarch64.dmg"
MOUNT="$PWD/.context/release-smoke/mnt"

rm -rf "$MOUNT"
mkdir -p "$MOUNT"

hdiutil verify "$DMG"
spctl -a -vvv --type open --context context:primary-signature "$DMG"
hdiutil attach "$DMG" -readonly -nobrowse -mountpoint "$MOUNT"

codesign --verify --deep --strict --verbose=2 "$MOUNT/Intentive.app"
spctl -a -vvv --type install "$MOUNT/Intentive.app"
file "$MOUNT/Intentive.app/Contents/Resources/resources/ollama"
codesign -dv --verbose=4 "$MOUNT/Intentive.app/Contents/Resources/resources/ollama"
codesign -dv --verbose=4 "$MOUNT/Intentive.app/Contents/Resources/resources/Intentive Capture.app"

hdiutil detach "$MOUNT"
```

**Pass:** `hdiutil verify` is valid; the DMG and mounted app are accepted as
`source=Notarized Developer ID`; `ollama` is a Mach-O binary, not a text Git LFS
pointer; nested binaries show `flags=0x10000(runtime)` and the `24D6NXS6H7`
authority.

### 2. Install the exact release app

```bash
rm -rf /Applications/Intentive.app
ditto .context/release-smoke/bundle/macos/Intentive.app /Applications/Intentive.app

stapler validate /Applications/Intentive.app
codesign --verify --deep --strict --verbose=2 /Applications/Intentive.app
spctl -a -vvv --type install /Applications/Intentive.app
file /Applications/Intentive.app/Contents/Resources/resources/ollama
codesign -dv --verbose=4 /Applications/Intentive.app/Contents/Resources/resources/ollama
codesign -dv --verbose=4 "/Applications/Intentive.app/Contents/Resources/resources/Intentive Capture.app"
```

**Pass:** `stapler` says "The validate action worked"; `spctl` says "accepted, source=Notarized Developer ID"; `codesign --verify` exits 0; nested binaries show `flags=0x10000(runtime)` and the `24D6NXS6H7` authority.

### 3. Fresh permission flow + the "Intentive" name

```bash
# Wipe Intentive's saved grants so the next launch prompts like a first run
tccutil reset ScreenCapture com.heyintentive.capture
tccutil reset Microphone   com.heyintentive.capture
tccutil reset Accessibility com.heyintentive.tauri
```

Launch, run Capture Permission Setup, then open **System Settings → Privacy & Security → Screen & System Audio Recording**.
**Pass:** the entry reads **Intentive** and shows the Intentive logo. It must not show `screenpipe`, `Intentive Capture`, lowercase `intentive`, a raw path, a blank icon, or the default macOS app icon. This is the load-bearing observation for ADR-0015/#54 — confirm it on the real notarized build, not in `tauri dev`.

### 4. The "downloaded from the internet" first-launch dialog

```bash
# Re-tag as freshly downloaded, then double-click to open
xattr -w com.apple.quarantine "0081;00000000;Safari;" /Applications/Intentive.app
```

**Pass:** macOS opens it with the normal first-run prompt — **no** "unidentified developer" / "cannot be opened" block.

### 5. Updater round-trip (ADR-0024)

1. Install version N (the tagged build).
2. Bump version, tag `desktop-v(N+1)`, let CI publish the new Release + `latest.json`.
3. Quit and relaunch N (or sleep/wake the Mac).
   **Pass:** N silently fetches and installs N+1; next launch reports the new version. No prompt shown.

---

## Ship gate (users have it)

Once the GitHub Release verification and clean-Mac smoke are green, flip the
landing-page download link to the GitHub Release `.dmg` URL. That is the moment
Intentive is in users' hands.

## Capture in docs after the smoke

The clean-Mac observation in step 3 finalizes ADR-0015's open identity question. Record the observed Privacy-Settings string (expected: **Intentive**) and icon (expected: Intentive logo) as a closing note on ADR-0015 once verified.
