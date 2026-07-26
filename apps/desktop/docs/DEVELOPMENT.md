# Desktop Development

Intentive Desktop is a native SwiftUI macOS application built with Swift Package
Manager. It is not Tauri and has no webview development loop.

## Daily loop

```bash
pnpm --dir apps/desktop build
pnpm --dir apps/desktop test
apps/desktop/macos/run.sh
```

All SwiftPM commands go through `macos/scripts/swiftpm.sh`, which places this
workspace's scratch data on T9 when required by the local machine policy.

`run.sh` builds and launches an assembled application:

| Setting       | Development value              |
| ------------- | ------------------------------ |
| App           | `Intentive Dev.app`            |
| Bundle ID     | `com.heyintentive.desktop.dev` |
| Configuration | Debug                          |
| Updates       | disabled                       |

Never launch the bare `.build/.../Intentive` executable for a product smoke.
macOS notification, Keychain, TCC, bundle-resource, and application identity APIs
require a real `.app`; an unbundled process can crash or produce misleading
permission behavior.

To connect to the local stack:

```bash
export INTENTIVE_CONTROL_PLANE_URL=http://127.0.0.1:8080
export INTENTIVE_DESKTOP_USER_JWT="$(
  scripts/local-dev-auth-token.mjs --user-id local-dev-user
)"
apps/desktop/macos/run.sh
```

Without the development JWT, the app uses the Keychain-backed hosted-auth adapter.
Provider keys never belong in the desktop process.

## Drive it like a user

Use Codex Computer Use against the assembled app's Accessibility tree:

1. read fresh app state;
2. perform one action by accessibility identity;
3. read fresh state again;
4. inspect the screenshot and relevant process logs;
5. require durable state or downstream acknowledgement for data flows.

SwiftUI can rerender and invalidate element indices while the app is running. Never
chain several stale indices.

Computer Use is the normal macOS UI driver. XcodeBuildMCP is still useful for
SwiftPM/Xcode builds, tests, discovery, logs, and debugging, but Xcode UI testing
is not a generic macOS application automation surface.

## Permission truth

The onboarding word `Granted` means the system permission API reported a grant. It
does not prove that capture works.

### Screen Recording

Acceptance requires the production `NativeScreenCaptureSource` to return a frame:

1. authenticate, complete every setup grant, then use **Resume Coaching** in the
   real UI to begin a new Coaching Window;
2. keep a unique marker visible in another app for a full capture cadence;
3. require a new `screen_memory_records` row with the correct app/window and
   non-empty OCR;
4. require a semantic embedding and a visible/searchable Rewind frame;
5. require the exact event ID in Agent Runtime `runtime_events` and
   `perception_records`, with the active `window_id`;
6. require the desktop outbox to drain after `runtime_ingress_ack`.
7. use **Pause Coaching**, then prove capture stops immediately and no new local
   or Runtime perception record appears.

Exact OCR text is not stable evidence (`O` and `0` can differ). Search stable words
and bind the proof by event ID.

### Microphone and VAD

Acceptance requires the production `NativeMicrophoneAudioCaptureService`:

1. authenticate, complete every required grant, and begin an eligible Coaching
   Window; there is no microphone-only coaching state;
2. deliver audible speech for longer than one four-second segment;
3. require AVAudioEngine PCM, a positive Silero VAD decision, and a non-empty local
   Parakeet transcript;
4. require `audio_memory_records` with retention metadata and a local embedding;
5. require an Agent Runtime `ambient_audio_summary` with
   `signals.audio_source=microphone` and the active `window_id`;
6. require the outbox to drain.

Raw PCM is consumed and discarded. Silence must not create a transcript. Signing
out, Pause Coaching, lock, sleep, or permission loss must stop the physical
sources. Screen, microphone, and system audio are atomically authorized by the
Coaching Window rather than independently enabled. The Parakeet actor must share
one in-flight model load; multiple simultaneous downloads/loads are a bug.

### System audio

System audio runs only while a Coaching Window is eligible and active; the
Founder Preview has no normal per-source or meeting-gated capture policy. Prove
system audio separately from microphone VAD because system audio intentionally
does not pass through the microphone voice gate. Pause, lock, sleep, sign-out,
quit, and required-permission loss must stop it synchronously.

## Deterministic gates

```bash
pnpm --dir apps/desktop typecheck
pnpm --dir apps/desktop test
pnpm --dir apps/desktop desktop:accept
pnpm harness --scope apps/desktop
```

`desktop:accept` is an assembled debug acceptance profile. Its loopback bridge may
seed fixtures and observe state; it must not perform user actions and it does not
replace a production-source capture proof.

## Clean first-run TCC

Host TCC grants persist by bundle ID. Use a disposable Tart clone to test the
brand-new-user screen/microphone/accessibility flow:

```bash
TART_HOME=/Volumes/T9/Tart pnpm --dir apps/desktop internal:status
TART_HOME=/Volumes/T9/Tart pnpm --dir apps/desktop internal:run
TART_HOME=/Volumes/T9/Tart pnpm --dir apps/desktop internal:close
```

Hard guardrails:

- `intentive-clean` is disposable and should be deleted/recreated freely.
- `intentive-base` and cached OCI base images are immutable, expensive templates.
- Never install Intentive into a base, grant permissions in a base, mutate a base,
  or delete a base.
- If a base seems contaminated, stop and inspect it. Rename it for recovery before
  any deliberate rebuild; never delete it speculatively.

The clean clone proves prompt order, deny/defer/grant behavior, relaunch durability,
and source shutdown after revocation. It does not replace a signed/notarized
release-candidate smoke or a physical multi-display host test.

## Three identities

| Channel           | Bundle ID                          | Artifact                           | Purpose                         |
| ----------------- | ---------------------------------- | ---------------------------------- | ------------------------------- |
| Daily development | `com.heyintentive.desktop.dev`     | assembled Debug app                | fast host iteration             |
| Preview           | `com.heyintentive.desktop.preview` | Developer-ID-signed Sparkle ZIP    | persistent founder dogfooding   |
| Production        | `com.heyintentive.desktop`         | Developer ID signed, notarized DMG | public distribution and Sparkle |

Development, Preview, and Production do not share Keychain items, TCC grants, or
launch-at-login registration. Clean Tart validation remains a Development test;
it is not how the persistent Preview app is built. Details are in
[PREVIEW.md](../../../docs/PREVIEW.md); release signing and Stage 2 gates are in
[RELEASE.md](RELEASE.md).

## Handoff

Report:

- assembled bundle path and identifier;
- build/test results;
- UI journey driven through Accessibility;
- whether real ScreenCaptureKit and AVAudioEngine sources produced data;
- local index/outbox state and matching Runtime event IDs;
- whether clean Tart, signing, notarization, and release-candidate gates ran.

Stop the app with Ctrl-C. Use `internal:close` only for the disposable Tart clone.
Keep the active SwiftPM cache and immutable base.
