# Auto-start Capture Session after desktop capture readiness

The Desktop Client automatically starts a Capture Session when a signed-in user launches it only after the Control Plane confirms Desktop Capture Readiness for that registered Mac. Consent for screen capture is Mac-specific because the Mobile Client and Desktop Client share identity and onboarding progress while only the Mac records the screen.

## Context

Two models were considered for how Capture Sessions begin:

- **Explicit toggle (Model A):** Intentive launches in a stopped state. The user must click "Start Capturing" in the menu bar before capture begins. The toggle is the primary control.
- **Auto-start after desktop capture readiness (Model B):** The Desktop Client launches and immediately starts a Capture Session if the user is signed in and the Control Plane confirms this Mac is desktop capture-ready. The toggle exists only to stop (or restart) capture manually.

## Decision

Model B. The Desktop Client is a background utility — the Option A mental model. Requiring the user to manually start capture every launch contradicts that positioning. Once the Mac is authorized for capture, it should just work.

Because capture starts without an explicit per-launch action, consent must be collected unambiguously on the Mac that will record the screen. **Capture Permission Setup** collects desktop capture consent and verifies the required macOS Privacy Settings grants. The Control Plane records or confirms **Desktop Capture Readiness** for that registered Mac only after setup completes.

Identity and relationship onboarding remain shared Control Plane state: a user can sign in and onboard first from either client. Signing in or finishing onboarding on the Mobile Client does not authorize screen capture on a Mac. The Desktop Client does not capture without a signed-in user and Control Plane-confirmed Desktop Capture Readiness.

## Considered Options

- **Consent bundled into shared sign-in:** Rejected — it would let mobile onboarding appear to authorize desktop screen capture without consent or OS grants on the recording Mac.
- **Consent via a settings toggle with a first-launch prompt:** Rejected — a toggle implies the user can opt out without signing out, which complicates the capture lifecycle and the agent contract.

## Consequences

- The menu bar toggle changes meaning: it is no longer "start/stop" but "stop" (when capturing) or "start" (when manually stopped). There is no separate start action on launch.
- Capture Permission Setup must include explicit desktop capture consent and live permission checks on the recording Mac. This is a v1 requirement, not a nice-to-have.
- The Control Plane, rather than client-local Auth state, is authoritative for whether the registered Mac may auto-start capture.
- A signed-in desktop session that is not desktop capture-ready remains idle and presents Capture Permission Setup.
- "Capture runs without auth" remains rejected; Auth and Desktop Capture Readiness are both prerequisites for any Capture Session.
