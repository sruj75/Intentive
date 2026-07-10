# Desktop Development

The current desktop app is a Swift Package Manager macOS app under `apps/desktop/macos`.

```bash
cd apps/desktop/macos
xcrun swift build -c debug --package-path Desktop
xcrun swift test --package-path Desktop
./run.sh
```

Use `./run.sh` for live local runs. Release bundling is handled by `macos/scripts/build-app-bundle.sh`; pass `INTENTIVE_APP_VERSION`, `INTENTIVE_APP_BUILD`, `INTENTIVE_AUTH_CALLBACK_SCHEME`, `INTENTIVE_SPARKLE_FEED_URL`, and `INTENTIVE_SPARKLE_PUBLIC_ED_KEY` when assembling a release candidate outside GitHub Actions.

## Internal build: clean macOS permission slate

Use an internal build for changes to Desktop Capture Readiness, permission onboarding, or native-bundle behavior. It builds the real SwiftPM `Intentive.app`, then runs it in a disposable [Tart](https://tart.run) macOS VM. Each run clones a pristine base VM, so Screen Recording, Microphone, and Accessibility begin ungranted without changing the host Mac.

### Agent operations

Tag this runbook into an agent and use the following phrases. The canonical VM store on this machine is `/Volumes/T9/Tart`; `internal:run` stays alive for the visible VM, so the agent starts it in the background and then hands off to the person at the keyboard.

| You say… | Agent runs | What happens |
| --- | --- | --- |
| **"spin up an internal build"** | `TART_HOME=/Volumes/T9/Tart pnpm --dir apps/desktop internal:run` **in the background** | Builds the native `.app`, clones `intentive-base` into a fresh `intentive-clean`, opens the VM, and shares the bundle. |
| **"close it" / "kill it"** | `TART_HOME=/Volumes/T9/Tart pnpm --dir apps/desktop internal:close` | Stops and deletes `intentive-clean`. The pristine base is preserved. |
| **"is it running?"** | `TART_HOME=/Volumes/T9/Tart pnpm --dir apps/desktop internal:status` | Shows the base and disposable clone, if present. |
| **"just build the app"** | `TART_HOME=/Volumes/T9/Tart pnpm --dir apps/desktop internal:build` | Builds and signs the native `.app` only. |
| **"rebuild the base"** | `TART_HOME=/Volumes/T9/Tart apps/desktop/macos/scripts/tart-internal-build.sh --create-base <ipsw-url-or-path>` | Creates a new pristine base; complete Setup Assistant before using it. |

The normal run is deliberately away-from-keyboard safe: closing the VM window, interrupting its runner, or using **"kill it"** invokes the same stop-and-delete procedure. Tart terminates every process inside the guest before it deletes the guest disk. The script starts no host-side backend, capture daemon, or helper process, so a completed cleanup leaves no internal-build servers running on the host.

### Clean-slate invariant

`intentive-base` is a template only. Never install, launch, sign in to, or grant permissions to Intentive in the base. An agent always boots **`intentive-clean`**, never the base; the bundle share is read-only and the person at the keyboard copies it into `/Applications` inside that clone. Intentive's installation, TCC grants, Keychain entries, Screen Memory, and any guest-side processes therefore belong only to the clone and disappear with **"kill it"**.

If the base is ever used for a real app test, it is contaminated: do not reuse it to claim a new-user experience. Delete/recreate the base, complete only Setup Assistant, and leave every app permission ungranted before the next internal build.

### Keep the caches; reset the guest

The fast development cache and the clean permission slate are deliberately independent. SwiftPM keeps its incremental build cache in `apps/desktop/macos/Desktop/.build` on the host, and Tart keeps the macOS base image and copy-on-write layers in `TART_HOME` (on this machine, `/Volumes/T9/Tart`). Keep both warm for fast builds and fast cloning. Only `intentive-clean` is reset: deleting that clone removes test state without rebuilding Swift dependencies or recreating macOS.

```bash
# Build the native app and open a fresh, self-cleaning VM.
TART_HOME=/Volumes/T9/Tart pnpm --dir apps/desktop internal:run

# Build only or delete the disposable VM.
TART_HOME=/Volumes/T9/Tart pnpm --dir apps/desktop internal:build
TART_HOME=/Volumes/T9/Tart pnpm --dir apps/desktop internal:close
```

The default clone is `intentive-clean`; its base is a local `intentive-base` when present, otherwise Tart's `ghcr.io/cirruslabs/macos-sequoia-base:latest`. `--delete` only removes the clone. A normal run deletes the clone when its VM window closes or the command is interrupted; the next run also removes any stale clone before creating a new one.

On first use, either allow Tart to pull its base image (allow roughly 90 GB free in `TART_HOME`) or create a local base from an IPSW:

```bash
export TART_HOME=/Volumes/T9/Tart # optional: keep VM images off the boot disk
apps/desktop/macos/scripts/tart-internal-build.sh --create-base \
  "https://updates.cdn-apple.com/.../UniversalMac_<version>_<build>_Restore.ipsw"
tart run intentive-base
```

Complete Setup Assistant in the base, create an admin user, and do **not** install Intentive or grant any permissions. Shut it down; internal builds clone that clean state. The IPSW macOS version must be no newer than the host macOS version.

Inside the fresh VM, copy `Intentive.app` from `/Volumes/My Shared Files/intentive-build/` into `/Applications`, then launch it and exercise the permission flow. The default internal build is ad-hoc signed, which is enough for a fresh-VM permission test; set `INTENTIVE_INTERNAL_SIGNING_IDENTITY` to test with a local signing identity. This lane does not replace a signed/notarized release-candidate smoke.

The app receives no shell environment when launched from Finder. The internal-build lane therefore validates bundle identity and permission readiness by default. To validate authentication or a live backend in the VM, launch the installed executable from Terminal with VM-reachable `INTENTIVE_CONTROL_PLANE_URL` and hosted-auth variables—never bake a user JWT or provider key into the app. VM capture validates the first-run flow, not a physical multi-display setup.

To connect the executable to the local stack, start the Control Plane and Agent Runtime from the root runbook, then launch Desktop with:

```bash
export INTENTIVE_CONTROL_PLANE_URL=http://localhost:8080
export INTENTIVE_DESKTOP_USER_JWT="$(scripts/local-dev-auth-token.mjs --user-id local-dev-user)"
cd apps/desktop/macos
./run.sh
```

Without `INTENTIVE_DESKTOP_USER_JWT`, Desktop uses its Keychain-backed hosted-auth seam and reports sign-in required until a token is available.

Hosted auth configuration:

```bash
export INTENTIVE_HOSTED_AUTH_URL=https://<auth-host>/sign-in
export INTENTIVE_AUTH_CALLBACK_SCHEME=intentive-desktop
# Required only when the callback returns an authorization code instead of a JWT.
export INTENTIVE_AUTH_TOKEN_EXCHANGE_URL=https://<auth-host>/desktop/token
```

The native path opens `INTENTIVE_HOSTED_AUTH_URL` with `ASWebAuthenticationSession`, validates the callback `state`, stores only the returned User JWT in Keychain, and never stores provider API keys on the Mac.

The target Protocol spine is:

```text
capture -> Screen Memory / Desktop Context Compiler -> perception_event -> Agent Runtime
floating bar / PTT -> user_message -> Agent Runtime
Agent Runtime -> companion_message -> Effect Runner / floating bar
```

Do not put provider API keys in the desktop app. Local models and local embeddings are allowed; cloud judgment belongs in the Agent Runtime.
