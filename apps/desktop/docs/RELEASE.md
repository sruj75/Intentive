# Desktop Release Runbook

How an Intentive macOS build goes from a tag to a notarized DMG in users' hands, and the **clean-Mac smoke** that gates the merge. This is the release-identity smoke required by ADR-0015 and the updater round-trip required by ADR-0024.

Distinct from [`SMOKE.md`](SMOKE.md), which is the _capture-session_ smoke (does capture work when signed in with all three grants). This doc is the _release_ smoke (is the shipped artifact trustworthy, correctly identified, and self-updating).

---

## One-time setup (human-in-the-loop)

These are credential steps only the owner can do. None are committed to the repo; all secrets live in GitHub Actions secrets.

1. **Apple Developer ID Application cert** — already held: `Developer ID Application: Srujan Gowda (24D6NXS6H7)`, valid to 2030. Export it from Keychain Access → right-click the cert → **Export** _with its private key_ → `.p12` with a password.
2. **App-specific password** — appleid.apple.com → Sign-In & Security → App-Specific Passwords. Used by `notarytool`.
3. **Tauri updater key** — `pnpm tauri signer generate` (run once). Keep the private key + passphrase backed up out of band (losing it strands the installed base — ADR-0024). Paste the **public** key into `tauri.conf.json` at `plugins.updater.pubkey`, replacing the committed `REPLACE_WITH_TAURI_SIGNER_PUBLIC_KEY` placeholder. The private key becomes the `TAURI_SIGNING_PRIVATE_KEY` secret below.
4. **Set GitHub Actions secrets** (repo → Settings → Secrets and variables → Actions):

   | Secret                               | Value                       |
   | ------------------------------------ | --------------------------- |
   | `APPLE_DEVELOPER_ID_CERT`            | `base64 -i cert.p12` output |
   | `APPLE_DEVELOPER_ID_CERT_PASSWORD`   | the `.p12` password         |
   | `KEYCHAIN_PASSWORD`                  | any random string           |
   | `APPLE_ID`                           | `22btrsn071@gmail.com`      |
   | `APPLE_APP_SPECIFIC_PASSWORD`        | from step 2                 |
   | `APPLE_TEAM_ID`                      | `24D6NXS6H7`                |
   | `TAURI_SIGNING_PRIVATE_KEY`          | from step 3                 |
   | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | step 3 passphrase           |

---

## Cutting a release

1. Bump `version` in `src-tauri/tauri.conf.json`.
2. Tag and push: `git tag desktop-v0.1.0 && git push origin desktop-v0.1.0`.
3. CI (`.github/workflows/desktop-release.yml`) builds, deep-signs nested binaries, signs + notarizes + staples, generates updater artifacts + `latest.json`, and attaches the `.dmg`, `.app.tar.gz`, `.sig`, and `latest.json` to a GitHub Release.

---

## Clean-Mac smoke (the merge gate)

You do **not** need a second Mac or a fresh user account. These commands reproduce a virgin first-launch on your own Mac. Run against the DMG downloaded **through a browser** (so it carries the quarantine flag), installed to `/Applications/Intentive.app`.

### 1. Gatekeeper + notarization verdict (machine-state-independent)

```bash
# Notarization stapled to the DMG and the app?
stapler validate ~/Downloads/Intentive_*.dmg
stapler validate /Applications/Intentive.app

# Would a stranger's Mac accept it? (authoritative — ignores local trust)
spctl -a -vvv --type install /Applications/Intentive.app
codesign --verify --deep --strict --verbose=2 /Applications/Intentive.app

# Every nested binary signed with Developer ID + hardened runtime?
codesign -dv --verbose=4 "/Applications/Intentive.app/Contents/Resources/resources/Intentive Capture.app"
codesign -dv --verbose=4 "/Applications/Intentive.app/Contents/Resources/resources/ollama"
```

**Pass:** `stapler` says "The validate action worked"; `spctl` says "accepted, source=Notarized Developer ID"; `codesign --verify` exits 0; nested binaries show `flags=0x10000(runtime)` and the `24D6NXS6H7` authority.

### 2. Fresh permission flow + the "Intentive Capture" name

```bash
# Wipe Intentive's saved grants so the next launch prompts like a first run
tccutil reset ScreenCapture com.heyintentive.capture
tccutil reset Microphone   com.heyintentive.capture
tccutil reset Accessibility com.heyintentive.tauri
```

Launch, run Capture Permission Setup, then open **System Settings → Privacy & Security → Screen & System Audio Recording**.
**Pass:** the entry reads **Intentive Capture** (never `screenpipe`, never lowercase `intentive`, never a path). This is the load-bearing observation for ADR-0015/#54 — confirm it on the real notarized build, not in `tauri dev`.

### 3. The "downloaded from the internet" first-launch dialog

```bash
# Re-tag as freshly downloaded, then double-click to open
xattr -w com.apple.quarantine "0081;00000000;Safari;" /Applications/Intentive.app
```

**Pass:** macOS opens it with the normal first-run prompt — **no** "unidentified developer" / "cannot be opened" block.

### 4. Updater round-trip (ADR-0024)

1. Install version N (the tagged build).
2. Bump version, tag `desktop-v(N+1)`, let CI publish the new Release + `latest.json`.
3. Quit and relaunch N (or sleep/wake the Mac).
   **Pass:** N silently fetches and installs N+1; next launch reports the new version. No prompt shown.

---

## Ship gate (users have it)

Once the four smoke steps are green, flip the landing-page download link to the GitHub Release `.dmg` URL. That is the moment Intentive is in users' hands.

## Capture in docs after the smoke

The clean-Mac observation in step 2 finalizes ADR-0015's open identity question. Record the observed Privacy-Settings string (expected: **Intentive Capture**) as a closing note on ADR-0015 once verified.
