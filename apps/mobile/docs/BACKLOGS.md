# Backlogs

## Data & Privacy copy (Consent Primer)

The Consent Primer body is omi's verbatim placeholder — it makes false claims for Intentive (audio recording, Deepgram, OpenAI). Policy links point to `https://heyintentive.com/privacy` and `/terms`. Replace the body with Intentive-accurate disclosure before App Store submission ([ADR 0020](adr/0020-mobile-consent-primer-is-data-and-privacy-acceptance.md)).

## Control Plane onboarding + trial gates

Mobile ships **Onboarding** (collapsed funnel) and **Free Trial** as client-resolved Pre-Chat Gates ([ADR 0019](adr/0019-mobile-onboarding-funnel-collapses-to-one-gate.md)). `mapAccountStateToLaunchState` marks both `completed` for every real `GET /me` response until:

1. `packages/api-contract` adds `onboarding` (and trial entitlement fields) to `PreChatGateKind` / `AccountState`
2. Control Plane `compute-next-gate.ts` sequences them with durable persistence
3. Cross-client suppression lands in the Control Plane gates domain (#26 scope)

Until then, stub `LaunchStateSource` dev scenarios (`needs-onboarding`, `needs-trial`) exercise the screens locally.

## Marketing site legal pages

Publish the canonical Privacy Policy and Terms of Service at:

- `https://heyintentive.com/privacy`
- `https://heyintentive.com/terms`

The Mobile Consent Primer links to these routes. Verify the live pages match before App Store submission.
