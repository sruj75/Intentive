# Preview Environments

Preview is the bridge between local development and production. It distributes an
immutable build to real hardware or a clean machine while keeping data, identity,
telemetry, update channels, and bundle identity isolated from production.

Preview is not another daily inner loop:

| Stage       | iOS                                                | macOS                                        |
| ----------- | -------------------------------------------------- | -------------------------------------------- |
| Development | EAS Development Client + Metro                     | assembled Debug `Intentive Dev.app`          |
| Preview     | EAS internal build on `preview` channel            | immutable internal `.dev` app/DMG            |
| Production  | TestFlight/App Store build on `production` channel | Developer ID signed/notarized production DMG |

## Environment contract

Every preview candidate must be bound to:

- one exact Git SHA;
- one isolated Control Plane/Agent Runtime environment;
- one non-production database branch;
- preview auth/provider configuration;
- preview Sentry/PostHog environments;
- no production secrets or production database URL;
- an explicit expiry/cleanup owner for generated data.

The candidate report records artifact ID/digest, SHA, environment URLs, database
branch, test account, test matrix, and remaining production-only gates.

## iOS preview

`apps/mobile/eas.json` defines `preview` as internal distribution with the
`preview` update channel and EAS environment.

Before spending build quota:

```bash
pnpm harness --scope apps/mobile
pnpm --dir apps/mobile eas:preflight
cd apps/mobile
eas env:list --environment preview
eas env:exec preview \
  'curl -sS -i "$EXPO_PUBLIC_NEON_AUTH_BASE_URL/get-session"'
```

The Neon Auth health request must return `200`. `412` with
`COMPUTE_QUOTA_EXCEEDED` blocks the preview auth run until the account/project
quota resets or the plan changes; a successful Google account picker does not
override that gate.

Build and install on a physical iPhone:

```bash
cd apps/mobile
eas build --platform ios --profile preview
```

For JS/assets compatible with the candidate's runtime version:

```bash
eas update --branch preview --environment preview
```

Preview acceptance:

1. install the internal build from its EAS artifact, not Metro;
2. cold-launch and sign in through native Google Sign-In;
   the Google OAuth page must identify Intentive, not a stale product brand;
3. require a Neon session and a User JWT accepted by the Control Plane;
4. complete/resume Launch State and the affected A-L journeys;
5. connect to preview Control Plane and Agent Runtime;
6. send a real message and receive a Companion reply;
7. verify SecureStore restoration across termination;
8. background/foreground and exercise notification registration;
9. verify preview telemetry receives only allowed data;
10. install a preview OTA, relaunch twice, and prove the update applies;
11. archive screenshots/logs and the EAS build/update IDs.

Simulator evidence is useful but cannot approve Google Sign-In, APNs, Keychain
lifecycle, or real background behavior.

## macOS preview

Daily and preview builds use `com.heyintentive.desktop.dev`; production uses
`com.heyintentive.desktop`. Preview must never use the production Sparkle feed or
production Keychain identity.

Build the internal app:

```bash
INTENTIVE_INTERNAL_PREVIEW=1 \
  INTENTIVE_CONTROL_PLANE_URL=https://control-plane.preview.example.com \
  INTENTIVE_HOSTED_AUTH_URL=https://auth.preview.example.com/sign-in \
  INTENTIVE_AUTH_TOKEN_EXCHANGE_URL=https://auth.preview.example.com/desktop/token \
  TART_HOME=/Volumes/T9/Tart \
  pnpm --dir apps/desktop internal:build
```

Replace the example values with the deployed preview environment. The command
fails closed if the required Control Plane or hosted-auth URL is absent, if an
endpoint is not public HTTPS, if the bundle identity is not
`com.heyintentive.desktop.dev`, or if Sparkle feed/signing metadata is present.
`internal:build` signs and then runs the bundle verifier against the exact path
it produced; do not follow it with `release:smoke`, because that command
deliberately builds a separate synthetic production-identity bundle for the
release harness.

For a daily clean-TCC development build that does not need live preview services,
omit `INTENTIVE_INTERNAL_PREVIEW` and the endpoint variables. It still verifies
the exact `.dev` app, including that optional service/update metadata is absent.

Run first-launch permissions in a disposable clean clone:

```bash
INTENTIVE_INTERNAL_PREVIEW=1 \
  INTENTIVE_CONTROL_PLANE_URL=https://control-plane.preview.example.com \
  INTENTIVE_HOSTED_AUTH_URL=https://auth.preview.example.com/sign-in \
  INTENTIVE_AUTH_TOKEN_EXCHANGE_URL=https://auth.preview.example.com/desktop/token \
  TART_HOME=/Volumes/T9/Tart \
  pnpm --dir apps/desktop internal:run
TART_HOME=/Volumes/T9/Tart pnpm --dir apps/desktop internal:close
```

Also install the exact candidate on a normal host and drive it through macOS
Accessibility. Preview acceptance requires:

1. correct `.dev` bundle identity and embedded preview service endpoints;
2. authentic hosted sign-in and Runtime connection;
3. real ScreenCaptureKit frame -> OCR/semantic Rewind index -> Runtime event;
4. real AVAudioEngine microphone -> Silero VAD -> local Parakeet transcript ->
   Runtime `ambient_audio_summary`;
5. no capture while signed out or while either relevant toggle is disabled;
6. deny/defer/grant and relaunch behavior in a clean Tart clone;
7. privacy exclusions, retention, deletion/tombstone, sleep/wake, and revocation;
8. no production update feed, tokens, telemetry environment, or data.

An ad-hoc internal signature can approve development/permission behavior. It cannot
approve Gatekeeper, notarization, stapling, or Sparkle. Those remain production
release-candidate gates.

## Promotion

Preview artifacts are never relabeled as production. Promotion means building the
production artifact from the accepted SHA with the production identity and then
running the production gates in [PRODUCTION.md](PRODUCTION.md) and the owning
release runbook.

Clean up the preview database/test data when the acceptance window closes. Delete
only the disposable Tart clone; preserve the immutable base.
