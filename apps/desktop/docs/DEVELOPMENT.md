# Desktop Development

The current desktop app is a Swift Package Manager macOS app under `apps/desktop/macos`.

```bash
pnpm --dir apps/desktop build
pnpm --dir apps/desktop test
apps/desktop/macos/run.sh
```

Use `apps/desktop/macos/run.sh` for live local runs. Release bundling is handled by `macos/scripts/build-app-bundle.sh`; pass `INTENTIVE_APP_VERSION`, `INTENTIVE_APP_BUILD`, `INTENTIVE_AUTH_CALLBACK_SCHEME`, `INTENTIVE_SPARKLE_FEED_URL`, and `INTENTIVE_SPARKLE_PUBLIC_ED_KEY` when assembling a release candidate outside GitHub Actions.

All active SwiftPM commands go through `macos/scripts/swiftpm.sh`. On this Mac it
fails closed unless T9 is mounted, and gives every Conductor workspace an isolated
scratch path under `/Volumes/T9/Developer/Intentive/workspaces/<workspace>/swiftpm/desktop`.
Do not bypass the wrapper with a raw `xcrun swift build`: that recreates a package-local
`.build` directory on the internal SSD. CI and machines without the local storage policy
fall back to a git-ignored workspace build root.

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

### Why we use a VM

The desktop app relies on native macOS features — screen capture, audio recording, Accessibility, and their associated privacy/TCC prompts. Testing these on the real Mac is unreliable because permissions and preferences persist across runs; you can't tell whether a flow actually triggers a first-time prompt or is silently reusing a grant from a previous test.

The VM solves this. It gives us a fresh macOS install with **zero pre-existing permissions**, simulating a brand-new user opening the app for the first time. Every `internal:run` clones a pristine base into a disposable VM, so each test starts from the same clean slate: no TCC grants, no Keychain entries, no Screen Memory, no prior onboarding state. You see exactly what a real first-time user sees.

**What we're validating in the VM:** the first-launch onboarding flow, the screen-capture / audio / Accessibility permission prompts, and the app's behavior when those permissions are granted or denied. This is not a replacement for a signed/notarized release smoke — it's the fast iteration loop for native permission behavior.

### How the VM stack works

Two pieces:

| | `intentive-base` | `intentive-clean` |
| --- | --- | --- |
| **What it is** | A template VM — macOS + Setup Assistant done, nothing else installed. Created once. | A clone of the base, created fresh every `internal:run`. This is the VM you actually see and test in. |
| **What lives in it** | Nothing test-related. No `Intentive.app`, no TCC grants, no Keychain entries. | Whatever the current test puts there: the app copy, permissions you grant, onboarding state. All of it. |
| **How long it takes to create** | An hour or more (IPSW download + Setup Assistant). This is why it's precious. | ~30 seconds (copy-on-write clone). |
| **How to reset it** | You don't. It's the template. **Never delete it.** If it needs rebuilding, see [Rebuilding the base](#rebuilding-the-base) below. | `internal:close` — deletes the clone. The next `internal:run` makes a fresh one. This is the normal, expected reset. |
| **What the script does with it** | `--create-base` creates it (one-time). No other command touches it. | `--delete` / `internal:close` / closing the VM window all delete the clone only. |

The script is deliberately built so the base cannot be deleted by normal operations: `--delete` stops/deletes only `intentive-clean`; `--create-base` refuses to run if a base already exists. **Never run a raw `tart delete intentive-base`.**

### The one rule that caused a major incident

**A dirty clone is normal and expected — it is not a problem.** The clone is where app installs, TCC grants, and test state belong. If `Intentive.app` is sitting in `intentive-clean`'s `/Applications`, that's the whole point — someone copied it there to test. You reset it with `internal:close` and a fresh `internal:run`. That takes 30 seconds.

**Never delete the base to "fix" a dirty clone.** The base is the expensive template that took an hour+ to set up. The clone is disposable. If you see something unexpected in the VM, the first question is always: is this the clone or the base? If it's the clone, run `internal:close` and move on. If you think the base itself is wrong, **boot the base VM directly and verify by inspection** — do not act on assumption. If the base genuinely needs rebuilding, rename it out of the way first so it can be recovered, then rebuild. Never nuke speculatively.

### Keep the caches; reset the guest

The fast development cache and the clean permission slate are deliberately independent. SwiftPM keeps its per-workspace incremental build cache on T9 through `macos/scripts/swiftpm.sh`, and Tart keeps the macOS base image and copy-on-write layers in `TART_HOME` (on this machine, `/Volumes/T9/Tart`). Keep both warm for fast builds and fast cloning. Only `intentive-clean` is reset: deleting that clone removes test state without rebuilding Swift dependencies or recreating macOS. When Conductor archives the workspace, its archive hook deletes that workspace's external SwiftPM cache so a useful cache cannot become abandoned deadweight.

```bash
# Build the native app and open a fresh, self-cleaning VM.
TART_HOME=/Volumes/T9/Tart pnpm --dir apps/desktop internal:run

# Build only or delete the disposable VM.
TART_HOME=/Volumes/T9/Tart pnpm --dir apps/desktop internal:build
TART_HOME=/Volumes/T9/Tart pnpm --dir apps/desktop internal:close
```

The default clone is `intentive-clean`; its base is a local `intentive-base` when present, otherwise Tart's `ghcr.io/cirruslabs/macos-sequoia-base:latest`. **OCI base images are immutable and read-only — they can never be contaminated.** A local `intentive-base` VM takes priority over the OCI image; if it exists and was tainted, every clone inherits the taint. Before creating a local base, prefer the OCI image unless you have a specific reason (e.g. custom macOS configuration).

`--delete` only removes the clone. A normal run deletes the clone when its VM window closes or the command is interrupted; the next run also removes any stale clone before creating a new one.

### Agent pre-run checklist

Before running `internal:run`, verify:

1. `tart list` shows the OCI base or a local `intentive-base`. If neither exists, the script will pull the OCI image (~25 GB, one-time). Wait for the pull to finish.
2. If a local `intentive-base` exists, it **must** be clean. To verify: `tart run intentive-base` and check `/Applications` for stale `Intentive.app`. If present, the base is contaminated — rename it out of the way (never delete) and rebuild from IPSW or OCI.
3. If only the OCI image exists (no local base), every clone is guaranteed clean. OCI images are immutable.
4. The disposable `intentive-clean` is expected to get dirty — that's where test state lives. Kill and re-clone, never touch the base.

**If you think the base is contaminated:** STOP. Boot the base VM directly and inspect `/Applications`. Do not delete the base on assumption. The clone being dirty is normal and expected.

<a id="rebuilding-the-base"></a>

### Rebuilding the base

The base is needed once (and again only if it's genuinely broken — not just because a clone looks dirty). Three options, fastest first:

**Option A — cached IPSW (fastest, no download).** Tart caches IPSWs it has already pulled at `$TART_HOME/cache/IPSWs/`. If files exist there, reuse one:

```bash
export TART_HOME=/Volumes/T9/Tart
ls /Volumes/T9/Tart/cache/IPSWs/*.ipsw   # pick the largest one (~18 GB)
apps/desktop/macos/scripts/tart-internal-build.sh --create-base \
  "/Volumes/T9/Tart/cache/IPSWs/<filename>.ipsw"
tart run intentive-base
```

**Option B — OCI pull (no local IPSW, ~25 GB download, takes hours).** Skip `--create-base`; `internal:run` will pull `ghcr.io/cirruslabs/macos-sequoia-base:latest` automatically when no local base exists. Requires ~90 GB free in `TART_HOME`.

**Option C — fresh IPSW from Apple.** Download a UniversalMac Restore IPSW from Apple's public CDN and point `--create-base` at the URL or local path:

```bash
export TART_HOME=/Volumes/T9/Tart
apps/desktop/macos/scripts/tart-internal-build.sh --create-base \
  "https://updates.cdn-apple.com/.../UniversalMac_<version>_<build>_Restore.ipsw"
tart run intentive-base
```

**After the base boots (any option):** Complete Setup Assistant, create an admin user, and do **not** install Intentive or grant any permissions. Shut it down; every `internal:run` clones that clean state. The IPSW macOS version must be no newer than the host macOS version.

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
