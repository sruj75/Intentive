# Auto-start Capture Session after auth with consent at sign-in

Intentive automatically starts a Capture Session when a signed-in user launches the app. Consent for this behavior is collected during sign-in, before the account is created.

## Context

Two models were considered for how Capture Sessions begin:

- **Explicit toggle (Model A):** Intentive launches in a stopped state. The user must click "Start Capturing" in the menu bar before capture begins. The toggle is the primary control.
- **Auto-start after auth (Model B):** Intentive launches and immediately starts a Capture Session if the user is signed in. The toggle exists only to stop (or restart) capture manually.

## Decision

Model B. Intentive is a background utility — the Option A mental model. Requiring the user to manually start capture every launch contradicts that positioning. Once signed in, the app should just work.

Because capture starts without an explicit per-launch action, consent must be collected unambiguously at a prior moment. That moment is sign-in: the sign-in flow includes a consent step before account creation that explains what Intentive captures and what it sends. The user cannot complete sign-in without agreeing. Auth = consent, one moment, permanent.

Intentive does not capture without a signed-in user. If the user is not signed in, the app sits idle at the menu bar.

## Considered Options

- **Consent as a separate first-run modal after sign-in:** Rejected — splits a single decision (sign in + allow capture) into two steps with no benefit.
- **Consent via a settings toggle with a first-launch prompt:** Rejected — a toggle implies the user can opt out without signing out, which complicates the capture lifecycle and the agent contract.

## Consequences

- The menu bar toggle changes meaning: it is no longer "start/stop" but "stop" (when capturing) or "start" (when manually stopped). There is no separate start action on launch.
- The sign-in flow must include an explicit consent screen before account creation. This is a v1 requirement, not a nice-to-have.
- The Neon Auth surface in Settings must support this consent step as Auth moves from account UI to completed Capture Session gating.
- "Capture runs without auth" is removed from the spec. Auth is now a hard prerequisite for any Capture Session.
