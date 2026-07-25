# Apple Development Workflow

Development is where code changes, local services, automated checks, and
brand-new-user tests happen. Nothing in this workflow is a durable app that the
founder lives with every day; that is [Preview](PREVIEW.md).

This is Intentive's normal code-to-working-product loop. It covers the two Apple
clients and the local services they depend on:

| Client | Product code             | Daily runtime                               |
| ------ | ------------------------ | ------------------------------------------- |
| iOS    | Expo / React Native      | Expo Development Client in an iOS Simulator |
| macOS  | native SwiftUI / SwiftPM | an assembled `Intentive Dev.app` on macOS   |

The macOS client is not Tauri. The iOS client is not tested in Expo Go because it
uses native modules. A green unit test or a permission label is not sufficient
evidence that a native capability works.

For a single deployable, use its detailed runbook:

- [Mobile](../apps/mobile/docs/DEVELOPMENT.md)
- [Desktop](../apps/desktop/docs/DEVELOPMENT.md)
- [Control Plane](../services/control-plane/docs/DEVELOPMENT.md)
- [Agent Runtime](../services/agent-runtime/docs/DEVELOPMENT.md)

Preview distribution is defined in [PREVIEW.md](PREVIEW.md). Production promotion
is defined in [PRODUCTION.md](PRODUCTION.md).

## The evidence ladder

Use the cheapest useful feedback first, then climb only as far as the change
requires:

1. **Deterministic:** focused tests, typecheck, lint, then
   `pnpm harness --scope <deployable>`.
2. **Native build:** EAS Development Client build for iOS; SwiftPM + assembled
   app bundle for macOS.
3. **Live UI:** drive the Simulator or macOS Accessibility tree like a user and
   inspect screenshots, logs, and application state after every action.
4. **Real integration:** connect the client to a local Control Plane and Agent
   Runtime backed by a disposable database. Prove durable rows and acknowledgements,
   not only UI copy.
5. **Clean environment:** physical iPhone for device-only capabilities and a clean
   Tart clone for first-run macOS TCC prompts.
6. **Preview/release candidate:** signed, immutable artifact in its distribution
   channel. Development evidence never substitutes for this gate.

Every handoff should say which rung passed and which rungs were not run.

## Prerequisites

- Node 24 or newer and pnpm 11.5.2 or newer.
- The repository's selected Xcode (`xcode-select -p`) and iOS Simulator.
- An authenticated Expo account with access to the Intentive EAS project.
- One booted iOS Simulator at a time.
- A non-production database branch or disposable Postgres for integration work.
- Accessibility permission for Codex Computer Use when an agent is driving UI.

Run the deterministic baseline before opening either client:

```bash
pnpm install --frozen-lockfile
pnpm harness --scope apps/mobile
pnpm harness --scope apps/desktop
```

On networks where Neon IPv6 races fail on this Mac, launch Node services with:

```bash
export NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection"
```

## Start the real local backend

The supported convenience path is:

```bash
scripts/local-stack.sh
```

It owns Control Plane `:8080`, Agent Runtime WebSocket `:8787`, and Runtime internal
HTTP `:8081`. Metro owns `:8082`.

The local stack must use an isolated database. Never point a Development workflow
at the production database. Human testing uses real Neon authentication. An
automated Development proof may explicitly select the guarded `local-dev` token
mode, in which case both services must use the same local auth secret.

There are two database modes:

- normal personal development reuses the persistent `dev-local-smoke` Neon branch;
- an autonomous full-stack integration run creates a temporary Neon branch,
  applies both `services/control-plane` and `services/agent-runtime` migrations,
  runs its proof, and deletes that same temporary branch even when the proof
  fails.

Deleting a branch created by that test is expected cleanup. Any destructive
operation against persistent development or production data requires explicit
human approval.

For a disposable proof, migrate both schemas before launching the services, clear
the account gates through Control Plane, and use `GET /agent` to obtain the Runtime
route. Do not fake the Runtime acknowledgement in an end-to-end proof.

## iOS: Expo Development Client

Use the installed Simulator inventory as truth:

```bash
xcrun simctl runtime scan-and-mount
xcrun simctl list runtimes
xcrun simctl list devices available
```

Choose one available iPhone and boot it by UDID:

```bash
IOS_UDID="<available-device-udid>"
xcrun simctl shutdown all
xcrun simctl boot "$IOS_UDID"
xcrun simctl bootstatus "$IOS_UDID" -b
open "$(xcode-select -p)/Applications/Simulator.app"
```

The native client is built by EAS, not by local `expo run:ios`, Xcode, or
CocoaPods. From `apps/mobile`:

```bash
npx -y eas-cli@21.2.0 whoami
npx -y eas-cli@21.2.0 env:list --environment preview
npx -y eas-cli@21.2.0 build \
  --platform ios \
  --profile development-simulator \
  --non-interactive \
  --wait
npx -y eas-cli@21.2.0 build:run \
  --platform ios \
  --profile development-simulator \
  --latest \
  --simulator "$IOS_UDID"
```

`development-simulator` extends the `development` profile, which enables
`developmentClient` and uses the non-production EAS `preview` environment. That
environment must contain both Google public client IDs so `app.config.js` embeds
the native reversed-client-ID URL scheme and the JavaScript runtime enables Google
Sign-In. EAS performs Continuous Native Generation when the gitignored `ios/`
project is absent; do not generate or patch it for this workflow.

Before exercising sign-in, prove the configured Neon Auth service is available:

```bash
npx -y eas-cli@21.2.0 env:exec preview \
  'curl -sS -i "$EXPO_PUBLIC_NEON_AUTH_BASE_URL/get-session"'
```

Require `200`. A `412` / `COMPUTE_QUOTA_EXCEEDED` response is a Neon quota gate,
not evidence of a broken Google token or Expo callback. Stop and report it until
the monthly quota resets or the plan changes.

After the native client is installed, JS/TS iteration is:

```bash
cd apps/mobile
npx -y eas-cli@21.2.0 env:exec preview \
  "EXPO_PUBLIC_CONTROL_PLANE_BASE_URL=http://localhost:8080 pnpm dev"
```

In another terminal:

```bash
xcrun simctl launch booted com.heyintentive.expo
xcrun simctl openurl booted \
  "intentive://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8082"
```

Metro keeps the preview environment's public client IDs while overriding only the
JavaScript-facing Control Plane URL for the local stack. Otherwise the binary can
contain Google's callback scheme while the JavaScript runtime either sees empty
client IDs or calls the remotely configured Control Plane instead of local `:8080`.

Re-run the EAS build only after native dependencies, config plugins, native
`app.json` keys, the Expo SDK, icons, or splash assets change. Ordinary JS/TS
changes stay in Metro and the installed client.

For each meaningful iOS change:

- walk the affected A-L journey in the Simulator;
- inspect the post-action screen and Metro/native logs;
- tap Google Sign-In and require both the Apple consent sheet and
  `accounts.google.com`; the OAuth page must identify Intentive, not a stale brand;
- require Neon to establish a session and `getUserJwt()` to produce a User JWT
  accepted by the Control Plane;
- cold-launch once after the warm reload passes;
- use a physical internal build for Google Sign-In, push, Keychain, backgrounding,
  and any claim whose behavior differs on real hardware.

The Google-hosted label comes from **Google Auth Platform → Branding → App name**,
not the Google Cloud project display name. A verified production app-name change
can require brand re-verification before users see it.

## macOS: assembled SwiftUI app

Build and test:

```bash
pnpm --dir apps/desktop build
pnpm --dir apps/desktop test
apps/desktop/macos/run.sh
```

`run.sh` assembles and launches `Intentive Dev.app` with bundle identifier
`com.heyintentive.desktop.dev`. Do not launch the raw SwiftPM executable: APIs such
as notifications, Keychain, TCC, and bundle resources require a real app bundle and
the raw executable can crash or produce false permission behavior.

To connect the app to the local stack:

```bash
export INTENTIVE_CONTROL_PLANE_URL=http://127.0.0.1:8080
export INTENTIVE_DESKTOP_USER_JWT="$(
  scripts/local-dev-auth-token.mjs --user-id local-dev-user
)"
apps/desktop/macos/run.sh
```

Drive the app through Computer Use using its macOS Accessibility tree. Read fresh
state after every action; element identities can change while SwiftUI rerenders.
Use screenshots for visual truth and process logs/database state for behavioral
truth.

### Screen capture acceptance

Do not accept the onboarding word `Granted` as proof. A valid live proof is:

1. Press the real **Screen Capture** toggle off and on in Settings.
2. Keep a unique marker visible in another app for at least one capture cadence.
3. Require a new `screen_memory_records` row with that app/window and Vision OCR.
4. Require a non-empty local semantic embedding and a searchable Rewind result.
5. Require the same event ID in Runtime `runtime_events` as `perception_event`.
6. Require a Runtime `perception_records` projection with
   `artifact_type=searchable_screen_record`.
7. Require the local Runtime outbox to drain after the acknowledgement.

OCR is probabilistic; assert stable words and event identity rather than exact
character equality.

### Microphone/VAD acceptance

Again, the permission label is only the precondition. A valid live proof is:

1. Enable Audio Recording while authenticated; Screen Capture may remain off.
2. Feed audible speech through the real microphone input for more than one
   four-second segment.
3. Require the AVAudioEngine source to deliver PCM and Silero VAD to accept speech.
4. Require Parakeet to produce a non-empty local transcript.
5. Require `audio_memory_records` to contain the transcript, retention metadata,
   and a local embedding. Raw PCM must not be retained.
6. Require Runtime to store an `ambient_audio_summary` whose
   `signals.audio_source` is `microphone`.
7. Require the outbox to drain.

Silence must create no transcript. Signing out or disabling audio must stop
physical microphone capture; Screen Capture is independently controlled. A test
fixture may verify policy branches, but it cannot replace the native-source proof
above.

For first-run permission behavior, run only a disposable Tart clone:

```bash
TART_HOME=/Volumes/T9/Tart pnpm --dir apps/desktop internal:run
TART_HOME=/Volumes/T9/Tart pnpm --dir apps/desktop internal:close
```

Never install into, mutate, or delete the Tart base image.

## XcodeBuildMCP and Computer Use

Use both; they solve different problems.

- Pin XcodeBuildMCP `2.7.0` for structured Xcode discovery, build/test, Simulator
  lifecycle, logs, screenshots, and iOS UI automation:

  ```bash
  npx -y xcodebuildmcp@2.7.0
  ```

- Use Computer Use for native macOS user interaction and visual inspection. Xcode
  UI testing supports iOS/tvOS/watchOS apps, but it is not a generic macOS app
  driver.
- Keep shell commands as the reproducible fallback and CI contract. An MCP result
  should map to an inspectable `xcodebuild`, `simctl`, or app-state artifact.

An agent should set session defaults once, then reuse the same workspace/project,
scheme, configuration, and Simulator UDID. Avoid rediscovering or booting multiple
simulators for every action.

## Artifact retention contract

Development teardown has three different responsibilities:

| Class                      | Examples                                                                                                                   | End-of-run policy                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Live runtime               | Metro, local services, app processes, booted Simulator, disposable Tart clone                                              | stop with `pnpm development:kill`                                          |
| Reusable native work       | installed EAS dev client, remote/local EAS artifacts, `node_modules`, SwiftPM scratch, assembled apps, immutable Tart base | preserve and reuse                                                         |
| Proof evidence             | EAS build ID/URL, screenshots, logs, event IDs, database query results                                                     | report or archive intentionally; temporary screenshots are deleted on kill |
| Disposable/sensitive state | one-run credentials, expired test databases, transient PID/log directories                                                 | remove when its proof window ends                                          |

A continuing branch/worktree is source state, not temporary scratch. Keep it on a
persistent workspace path; `/tmp` and `/private/tmp` are appropriate only for
replaceable run files. Shutting down a Simulator must not erase it or uninstall the
development client.

For Mobile, reuse the installed EAS development client until the native dependency
graph changes. JS/TS changes need only Metro. A native change requires a new EAS
artifact, but EAS build caches and the prior build ID stay useful; do not clear
them by default.

## Final handoff

Before handing work back:

```bash
pnpm harness
git diff --check
git status --short
```

Also report:

- iOS device/runtime and whether the dev client rendered;
- macOS bundle ID and whether the assembled app launched;
- the exact live capability proof that ran;
- any external gate still required, such as physical iPhone, clean Tart, signing,
  notarization, TestFlight, or App Store review.

Stop live development processes without discarding reusable work:

```bash
pnpm development:kill
```

`development:kill` stops the local stack, Metro, the Desktop Client, Simulator,
and the disposable Tart clone. It preserves installed Simulator apps, EAS build
artifacts and caches, `node_modules`, SwiftPM scratch and assembled apps, and the
immutable Tart base. Intentive-named temporary screenshots are deleted.

Use `pnpm development:prune` only when local one-run EAS archives and temporary
EAS builder directories are deliberately no longer useful. It does not delete
remote EAS builds or shared native caches. Remove disposable databases only when
their proof window ends.
