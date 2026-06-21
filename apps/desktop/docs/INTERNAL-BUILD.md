# Internal build (disposable clean slate)

How to exercise the real `Intentive.app` bundle against a **fresh permission slate**, for anything touching **Desktop Capture Readiness**.

macOS has no simulator — the host Mac _is_ the device, so `pnpm tauri dev` already runs the real Rust backend end-to-end. The one thing it can't reproduce is **real permission identity**: in dev the running binary is a bare, ad-hoc-signed Mach-O at `target/debug/`, not the signed `Intentive.app`, so TCC grants (Screen Recording / Microphone / Accessibility) churn on every rebuild and don't reflect the shipped `com.heyintentive.tauri` identity. For anything touching **Desktop Capture Readiness**, build a real bundle instead of trusting `tauri dev`.

The internal-build equivalent of "boot a fresh simulator and install the app" is a **`--debug` bundle run inside a disposable [Tart](https://tart.run) macOS VM** — the VM gives a fresh TCC slate every clone so the first-run grant flow behaves as it does for a new user, without polluting the host's permission state.

```bash
apps/desktop/scripts/tart-internal-build.sh            # build --debug .app + fresh ephemeral VM + run
apps/desktop/scripts/tart-internal-build.sh --keep     # same, but persist the VM on exit (re-use it)
apps/desktop/scripts/tart-internal-build.sh --build    # just build the --debug bundle
apps/desktop/scripts/tart-internal-build.sh --delete   # stop + delete the VM instance now
```

Inside the VM (login `admin` / `admin`): copy `Intentive.app` from the shared folder (`/Volumes/My Shared Files/intentive-build/`) into `/Applications`, launch, and grant the three macOS permissions when prompted.

**Ephemeral by default — no trace, no parasites.** Every run starts from a _pristine_ clone (any stale instance is deleted first, so it self-heals after a prior hard kill) and tears the instance down on exit — normal close, window-close, Ctrl-C, or TERM. Because ScreenPipe, Ollama, and every server run **inside** the guest, deleting the instance is a hard guarantee that nothing keeps running on the host; there is no host-side process to leak. The reusable **base template** is kept (deleting it forces a ~50 GB re-pull) — it holds no user data and runs nothing. Use `--keep` to persist an instance across runs, `--delete` to nuke it manually.

### Offloading the heavy bits to another volume

The two large artifacts are the VM images (~50–90 GB) and the Rust `target/` (~7 GB+). On a small boot volume, point both at a roomy disk; the script reads these and runs its disk-space guardrail against the _right_ volume:

```bash
TART_HOME=/Volumes/T9/Tart \
CARGO_TARGET_DIR=/Volumes/T9/intentive-target \
  apps/desktop/scripts/tart-internal-build.sh
```

On this machine T9 is the storage volume (see [`AGENTS.md`](../AGENTS.md) § Stack & deploy); export those two vars so neither the images nor the build touch the boot volume.

The build ladder, from least to most production-like: `pnpm --filter ./apps/desktop dev` (UI only) → `pnpm tauri dev` (real backend, unstable permission identity) → **`--debug` bundle in a Tart VM (real backend + clean permission identity)** → `pnpm tauri build` notarized DMG (Gatekeeper-clean, updater-backed; [`RELEASE.md`](RELEASE.md)).

Constraints, called out because they bite:

- **Disk.** Any macOS VM base image is ~50–90 GB (Tart-agnostic). The script **refuses to `tart pull` below ~90 GB free on the `TART_HOME` volume**, and the `--debug` build needs ~12 GB on the `CARGO_TARGET_DIR` volume — a partial pull on a near-full boot volume can wedge macOS, which is why both default to guardrailed checks against whichever volume you point them at.
- **Apple Silicon only**, matching V1. Tart runs on Apple's Virtualization.framework; clones are copy-on-write so a fresh pristine instance per run is cheap once the base is pulled.
- **VM capture is the virtual display**, not your real multi-display setup — fine for exercising the permission/readiness _flow_, not representative of real capture content.
- **`CARGO_HOME` relocation:** the build invokes `cargo` via `pnpm tauri build`. If your shell relocates `CARGO_HOME`/`RUSTUP_HOME` to an external volume, run the script from a terminal where that volume is mounted (on this machine, T9 — see [`AGENTS.md`](../AGENTS.md) § Stack & deploy).
