# Preview: Founder Dogfooding

Preview is the temporary pre-launch period in which the developer uses installed
Intentive clients every day like a real user.

It is deliberately simple:

- real authentication;
- the production Control Plane;
- the production Agent Runtime;
- production Neon data;
- the same Sentry and PostHog projects as Production;
- persistent accounts, permissions, Screen Memory, and settings.

Preview is not a separate backend, staging environment, disposable test account,
or clean-first-launch test. Those tests belong in
[Development](DEVELOPMENT.md). Preview also is not a consumer release; the App
Store and notarized Desktop DMG remain [Production](PRODUCTION.md).

## The three stages in plain English

| Stage       | What it means                                                              |
| ----------- | -------------------------------------------------------------------------- |
| Development | Change code quickly, run local services, and let agents test clean states. |
| Preview     | Install the clients and personally live with them against Production.      |
| Production  | Distribute the consumer apps through the normal public channels.           |

There is no Preview deployment for the Control Plane or Agent Runtime. A backend
change is developed locally and, when accepted, follows its existing Production
release workflow. Preview clients simply use whichever backend version is live.

## Mobile Preview

Mobile Preview is the `preview` profile in
[`apps/mobile/eas.json`](../apps/mobile/eas.json):

- EAS internal distribution, so it installs on the registered iPhone;
- a standalone app, so Metro and a development server are not required;
- the `preview` EAS Update channel for fast compatible JS/asset updates;
- the same `com.heyintentive.expo` bundle identifier as Production;
- real authentication and production service URLs.

The same iOS identity is intentional. Preview is temporary, only one copy needs
to be installed, and the production App Store app will replace it.

Before building, the EAS `preview` environment must contain the production
Control Plane and Neon Auth public values plus the normal Sentry/PostHog values.
Then:

```bash
pnpm harness --scope apps/mobile
pnpm --dir apps/mobile eas:preflight
cd apps/mobile
eas env:list --environment preview
eas build --platform ios --profile preview
```

Install the EAS internal-distribution artifact on the physical iPhone and use it
normally. For a compatible JS/assets-only iteration:

```bash
cd apps/mobile
eas update --branch preview --environment preview
```

Require a real sign-in, a Neon session, a User JWT accepted by the Control Plane,
a real Companion reply, SecureStore restoration after termination, and normal
background/foreground behavior. A `412 COMPUTE_QUOTA_EXCEEDED` response from
Neon blocks this proof until the quota resets or the Neon plan is changed.

After the first public launch, this temporary Mobile Preview phase ends. The
developer uses the Production App Store app like every other user. A permanent
parallel Mobile dogfood system can wait until the product has enough users to
justify it.

## Desktop Preview

Desktop needs a separate identity because macOS TCC permissions, Keychain items,
and launch-at-login registration are tied to application identity.

| Setting          | Preview value                            |
| ---------------- | ---------------------------------------- |
| App              | `Intentive Preview.app`                  |
| Bundle ID        | `com.heyintentive.desktop.preview`       |
| Auth callback    | `intentive-desktop-preview`              |
| LaunchAgent      | `com.heyintentive.desktop.preview.login` |
| Installation     | `/Applications/Intentive Preview.app`    |
| Updates          | Sparkle ZIP from a GitHub pre-release    |
| Signing          | Developer ID                             |
| DMG/notarization | not required for Preview                 |

The separate identity ensures Preview permissions cannot make the later
Production app appear already tested. Unlike a clean Development test, Desktop
Preview keeps its state for daily use.

Before the first publish, register `intentive-desktop-preview` as an allowed
callback scheme in the hosted-auth flow. Publishing verifies the scheme embedded
in the app, but only a real sign-in can prove the external auth service accepts
the redirect. Do not call Desktop Preview usable until sign-in returns to
`Intentive Preview.app`, stores the session in its Preview Keychain boundary, and
reconnects after quitting and reopening the app.

### Publish an update

Start from a clean committed Git SHA. Export the same public service and telemetry
configuration used by Production, plus the existing signing material:

```bash
export INTENTIVE_CONTROL_PLANE_URL="https://control-plane-pqenui44sa-uw.a.run.app"
export INTENTIVE_HOSTED_AUTH_URL="<production hosted-auth URL>"
export INTENTIVE_AUTH_TOKEN_EXCHANGE_URL="<only when required>"
export INTENTIVE_SPARKLE_PUBLIC_ED_KEY="<public Sparkle key>"
export INTENTIVE_SPARKLE_PRIVATE_KEY="<private Sparkle key>"
export INTENTIVE_SENTRY_DSN="<Desktop Sentry DSN>"
export INTENTIVE_POSTHOG_PROJECT_KEY="<Desktop PostHog key>"

pnpm --dir apps/desktop preview:publish
```

`preview:publish` builds `Intentive Preview.app`, embeds the production endpoints,
Developer-ID-signs the app, creates and Sparkle-signs `Intentive-Preview.zip`, and
uploads the ZIP plus `appcast-preview.xml` to the repository's
`desktop-preview` GitHub pre-release. It intentionally does not create a DMG or
submit to Apple notarization.

Install it once:

```bash
pnpm --dir apps/desktop preview:install
```

The installer places the app in `/Applications`. From then on Sparkle checks the
Preview feed hourly. The update UI and install-on-quit behavior are the same as
Production.

## What Preview acceptance means

The Desktop Performance Coach implementation reaches Preview when the signed
`Intentive Preview.app` is installed, completes a real production sign-in, opens
one Desktop Coaching Window, delivers one non-focus-stealing Opening Orientation,
and proves Pause Coaching stops every perception source. There is no fixed
dogfood-day count before the founder can start using that build.

After that installation gate, use the Preview normally and watch Langfuse,
Sentry, and PostHog. Fix problems in Development, publish another Preview client
update, and continue using the same account and state. Repeated real-work evidence
is the product-learning loop; it is not a prerequisite for beginning the loop.

Do not reset permissions, create a clean database, or run a disposable VM to
approve Preview. Those actions answer a different question: whether a brand-new
user works, which belongs to Development and the final Production release gate.
