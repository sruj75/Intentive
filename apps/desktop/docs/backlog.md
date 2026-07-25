# Desktop Client Backlog

This document records work deliberately deferred from the Omi-derived macOS UI renovation. It is not part of the current V1 implementation.

## V1 boundary

- Treat the current slice as UI work. Clone the selected Omi settings and Mac setup surfaces, but do not redesign or expand authentication.
- Mobile remains the only first-time product-onboarding entry point. A V1 user creates the account and completes the shared onboarding gates on Mobile, then installs the Desktop Client and signs in with the same Neon identity.
- If the Control Plane reports an unfinished cross-client gate, the Desktop Client directs the user to finish setup on Mobile instead of reimplementing that gate on macOS.
- After sign-in, macOS owns only device-local setup: the retained Omi trust primer, Screen Recording, Microphone, Accessibility, Floating Bar shortcut, and Floating Bar demo screens.
- The Omi-styled Apple and Google sign-in screen replaces only the visible provider-picker presentation. The current implementation must not change the Neon Auth, JWT, Keychain, Control Plane, Runtime routing, or account behavior behind it.

## Post-V1: macOS as a first-class onboarding entry point

Make macOS capable of starting the same product onboarding that Mobile starts today.

- Apple and Google sign-in on either client authenticate through the same Neon Auth project and resolve to the same Control-Plane User, durable account rows, Agent Instance, and Conversation History.
- Move shared onboarding progress behind Control-Plane-owned, idempotent gate contracts. A gate completed on Mobile or macOS is immediately satisfied for the other client.
- Keep device-local gates device-local. Screen Recording, Microphone, Accessibility, and shortcut/demo completion apply only to the Mac that owns those permissions and preferences.
- Compose each client flow from shared gates plus its own device-local gates. Never make users repeat identity, consent, or any other cross-client step already completed elsewhere.
- When macOS creates the account first, Mobile must recognize the existing Neon identity and Control-Plane account and resume only the remaining Mobile-local or incomplete shared steps.
- Define recovery for interrupted onboarding, provider cancellation, account-provider linking, reinstall, a second Mac, and users upgrading from the V1 Mobile-first flow.
- Add cross-client acceptance coverage for Mobile-first, macOS-first, interrupted, resumed, reinstalled, and second-device journeys.

## Other deferred capabilities

### Private cloud sync

- V1 recordings, screenshots, video, audio, and local Rewind data remain on the Mac. The cloned Private Cloud Sync control stays off and unavailable.
- A later roadmap slice must define the synchronized data classes, encryption and key ownership, retention/deletion propagation, conflict handling, offline behavior, and user-visible sync state before enabling the control.

### Beta update channel

- V1 uses the existing signed stable Sparkle feed. Beta remains visible but unavailable in the cloned About UI.
- Enable Beta only after a separately signed beta appcast, release workflow, downgrade behavior, and acceptance coverage exist.

### Public About destinations

- Keep unavailable Help Center, Privacy Policy, Terms of Service, and other unresolved Intentive destinations visible but disabled in V1.
- Enable each row only after a canonical Intentive-owned URL is configured and release-smoked.
