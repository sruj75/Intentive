# Internal build (disposable clean slate)

How to exercise the real `Intentive.app` bundle against a **fresh permission slate**, for anything touching **Desktop Capture Readiness**. Tag this file and say _"spin up an internal build"_ or _"close it"_ — the **Agent operations** below are the exact commands to run.

macOS has no simulator — the host Mac _is_ the device, so `pnpm tauri dev` already runs the real Rust backend end-to-end. The one thing it can't reproduce is **real permission identity**: in dev the running binary is a bare, ad-hoc-signed Mach-O at `target/debug/`, not the signed `Intentive.app`, so TCC grants (Screen Recording / Microphone / Accessibility) churn on every rebuild and don't reflect the shipped `com.heyintentive.tauri` identity. For anything touching **Desktop Capture Readiness**, build a real bundle and run it in a disposable [Tart](https://tart.run) macOS VM, which gives a fresh TCC slate every clone.

## Agent operations

**This machine's canonical env** (T9 is the storage volume — keeps the ~26 GB VM and ~7 GB Rust `target/` off the small boot volume). Every command below assumes it:

```bash
export TART_HOME=/Volumes/T9/Tart
export CARGO_TARGET_DIR=/Volumes/T9/intentive-target
```

| You say…                        | Agent runs                                                                  | What happens                                                                                                                           |
| ------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **"spin up an internal build"** | `apps/desktop/scripts/tart-internal-build.sh` &nbsp;(**run in background**) | Builds the `--debug` `.app`, clones `intentive-base` → a fresh ephemeral `intentive-clean`, opens the VM window, shares the bundle in. |
| **"close it" / "kill it"**      | `apps/desktop/scripts/tart-internal-build.sh --delete`                      | Stops + deletes the ephemeral `intentive-clean`. The `intentive-base` golden base is left untouched.                                   |
| **"is it running?" / status**   | `tart list`                                                                 | `intentive-base` = the kept base; `intentive-clean` present only while a build is live.                                                |
| **"just build the app"**        | `apps/desktop/scripts/tart-internal-build.sh --build`                       | Builds the `--debug` bundle only, no VM.                                                                                               |
| **"rebuild the base"** (rare)   | see [Recreating the base](#recreating-the-base-rare)                        | One-time; only if the base is deleted or macOS drifts.                                                                                 |

**Agent notes:**

- **Run "spin up" in the background** (it blocks on the live VM window). The script is **self-cleaning**: closing the VM window, killing the run process (TERM), or `--delete` all stop _and delete_ the ephemeral instance — ScreenPipe/Ollama run **inside** the guest, so nothing leaks onto the host. There is no "stale server" to chase.
- **The agent boots the VM, then hands off.** Granting the three macOS permissions is a GUI-only TCC flow that can't be scripted — the agent's job ends at a booted VM with the bundle shared in; the human does the in-VM steps below.
- **Never delete `intentive-base`** as part of "close" — `--delete` only touches the ephemeral instance, by design.

### In-VM steps (human, after the agent boots it)

In the VM window, log in as `admin` if prompted (the account set during base setup). Then:

1. Finder → **Go → Go to Folder…** → `/Volumes/My Shared Files/intentive-build/` → drag **`Intentive.app`** into `/Applications`.
2. Launch from `/Applications`. Ad-hoc signed, so if macOS blocks it: **right-click → Open → Open**.
3. Grant **Screen Recording + Microphone + Accessibility** when prompted — this is the clean-slate first-run flow you came here to exercise.

## How it stays disposable

`intentive-base` is the **golden base**: macOS + the `admin` account, captured **pre-permission-grants**. Every "spin up" makes a copy-on-write clone (`intentive-clean`) — so each run starts from the base's _clean TCC slate_ and the first-run grant flow behaves exactly as it does for a brand-new user, without polluting the host's permission state. Any stale `intentive-clean` is deleted before the next clone, so it self-heals even after a hard `kill -9`. Clones are cheap (CoW); the base holds no grants and runs nothing.

## Debugging the clone (Sentry)

A clone has no host-visible terminal, so the way errors reach a coding agent is **Sentry** — but only if the DSN is **baked into the bundle at build time**. Rust reads `option_env!("SENTRY_DSN")` at compile time and Vite inlines `VITE_SENTRY_DSN` at build time; the clone carries neither, so a build with no DSN ships Sentry **off** and the VM reports nothing.

`tart-internal-build.sh` bakes it for you: it reads `SENTRY_DSN` / `VITE_SENTRY_DSN` from your shell or `apps/desktop/.env`, tags `environment=internal-build` (so VM errors stay separate from production), stamps a `desktop@internal-<sha>` release, **re-bakes only when the DSN changes**, and **warns if no DSN is found** (so Sentry-off is never silent).

**One-time setup** — drop the **public** DSN into `apps/desktop/.env` (keys are in `.env.example`):

```
SENTRY_DSN=…            # public DSN, Sentry project heyintentive/desktop
VITE_SENTRY_DSN=…       # same value (webview)
```

Then a coding agent reads VM errors via the **Sentry MCP** — org `heyintentive`, project `desktop`, filter `environment:internal-build` — or the Sentry UI. The DSN is public; only the source-map upload token is secret. Note this is **errors/panics only**, not a full debug-log stream (the Rust side has no logging facade yet — only `eprintln!` to stderr, which stays inside the VM).

## The build ladder

From least to most production-like: `pnpm --filter ./apps/desktop dev` (UI only) → `pnpm tauri dev` (real backend, unstable permission identity) → **`--debug` bundle in a Tart VM (real backend + clean permission identity)** → `pnpm tauri build` notarized DMG (Gatekeeper-clean, updater-backed; [`RELEASE.md`](RELEASE.md)).

---

## Reference

### Recreating the base (rare)

The base only needs (re)building if it's deleted or the host macOS drifts far from it. Two sources; the script clones from whatever `TART_BASE_IMAGE` points at (an OCI ref _or_ a local VM name), and **auto-detects a local `intentive-base` when present**, so day-to-day runs need no flags.

**Option A — ghcr OCI image.** `ghcr.io/cirruslabs/macos-sequoia-base:latest`, pulled automatically, ships a baked-in `admin`/`admin` user + SSH. Use it when ghcr's blob CDN is reachable. (On some networks `pkg-containers.githubusercontent.com` stalls/drops large pulls — then use Option B.)

**Option B — local base from an Apple IPSW.** Builds the base straight from Apple's CDN:

```bash
# 1) one-time create — IPSW macOS version MUST be <= host's (sw_vers -productVersion)
apps/desktop/scripts/tart-internal-build.sh --create-base \
  "https://updates.cdn-apple.com/.../UniversalMac_<ver>_<build>_Restore.ipsw"

# 2) boot the new base once, complete Setup Assistant (create the admin account),
#    do NOT grant any permissions, then shut it down:
tart run intentive-base

# 3) from here on, normal runs auto-detect it — just:
apps/desktop/scripts/tart-internal-build.sh
```

Three things bite, all handled by `--create-base`:

- **Version ceiling.** Virtualization.framework can only restore a guest macOS **≤ the host's**. `--from-ipsw latest` grabs a newer macOS than an un-updated host and fails the _install_ step (after the full ~18 GB download) with `a software update is required to complete the installation`. Pick an IPSW `≤ sw_vers -productVersion`; matching the host version exactly is safest. Find current `UniversalMac_*_Restore.ipsw` URLs via [mrmacintosh.com](https://mrmacintosh.com/apple-silicon-m1-full-macos-restore-ipsw-firmware-files-database/) / [theapplewiki.com](https://theapplewiki.com/wiki/Firmware/Mac/26.x); HEAD-check the URL (expect `200` + ~18 GB) before committing.
- **No retry in tart's downloader.** `tart create --from-ipsw <url>` has no resume — a single transient drop kills the whole ~18 GB. `--create-base` downloads URLs with `curl -C -` (resume + retry) so drops resume instead of restarting; the install then reads the **local** IPSW with zero network risk.
- **No prebaked user.** A from-IPSW base is bare macOS — hence the one-time Setup Assistant. Keep the base pristine (never grant permissions in it).

### Storage / offloading

The two large artifacts are the VM images (base ~26 GB + each clone's CoW delta) and the Rust `target/` (~7 GB+). On this machine both live on **T9** via the env vars above; the script runs its disk-space guardrail against whichever volume each points at. See [`AGENTS.md`](../AGENTS.md) § Stack & deploy.

### Constraints, called out because they bite

- **Disk.** A from-scratch ghcr base pull is ~50–90 GB; the script **refuses to `tart pull` below ~90 GB free on the `TART_HOME` volume**, and the `--debug` build needs ~12 GB on the `CARGO_TARGET_DIR` volume — a partial pull on a near-full boot volume can wedge macOS. (The local `intentive-base` route sidesteps the pull entirely.)
- **Apple Silicon only**, matching V1. Clones are copy-on-write, so a fresh pristine instance per run is cheap once the base exists.
- **VM capture is the virtual display**, not your real multi-display setup — fine for exercising the permission/readiness _flow_, not representative of real capture content.
- **`CARGO_HOME` relocation.** The build invokes `cargo` via `pnpm tauri build`. This machine relocates `CARGO_HOME`/`RUSTUP_HOME` to T9 (via `~/.zshenv`); run from a terminal where T9 is mounted (see [`AGENTS.md`](../AGENTS.md) § Stack & deploy).
