# The Consent Primer is a Data & Privacy acceptance, not a memory explainer

The **Consent Primer** (#20, ADR 0013) shipped as a trust-setting explainer of memory, follow-ups, and user control ("How Intentive remembers"). Reviewing it against the omi-modeled flow, that framing is **wrong**: the gate between identity and the funnel is a **Data & Privacy** acceptance — what data Intentive collects and how it is processed, plus links to the Privacy Policy and Terms of Service — with a single affirmative "Agree & Continue". Memory/relationship explanation is Runtime-authored in-chat (ADR 0006 as superseded by [ADR 0018](0018-mobile-pre-chat-funnel-minimum.md)), not a consent screen's job.

ADR 0013's *mechanics* are unchanged: the gate writes `consent: "completed"` into **Launch State** directly via the `setConsent` mutator, with no consent service between screen and store (a wrapper would be a shallow module). Only the gate's *meaning and copy* change.

**Considered Options** (central decision: what is this gate actually asking?)

- Keep the memory/trust explainer. Rejected: it is capability-dishonest as a "consent" gate — it asks the user to accept nothing legal, while the real need (data processing + policy acceptance) goes unmet. The reference apps all put a data/privacy acceptance here.
- Split into two gates: a data-privacy acceptance *and* a memory explainer. Rejected: the memory explanation belongs in-chat (ADR 0006), and a second pre-chat screen with no acceptance is exactly the over-modeling ADR 0019 avoids.
- Redefine the one gate as the Data & Privacy acceptance (chosen). One gate, one affirmative action, honest about what it collects.

**Consequences**

- **Scaffold copy is omi's, verbatim, as a placeholder** — including claims that are false for Intentive today (audio recordings, Deepgram transcription, OpenAI analysis) and `#` policy links. Superseded 2026-07-02: the screen now uses Intentive-accurate disclosure and links to `heyintentive.com/privacy` and `/terms`. Publishing the full legal pages on the marketing site remains a pre-ship dependency ([`docs/BACKLOGS.md`](../BACKLOGS.md)).
- **CONTEXT.md is the source of truth for the redefinition.** The `Consent Primer` term now reads "the Data & Privacy screen…"; its `_Avoid_` list drops the old "terms gate / privacy prompt" phrasings and keeps "consent screen, permission primer". The "Flagged ambiguities" section records the 2026-07-02 resolution.
- **The gate still requests no notification permission and imports nothing notification-related** — that is the separate **Grant Permissions** step in the onboarding funnel ([ADR 0019](0019-mobile-onboarding-funnel-collapses-to-one-gate.md)).
- **Durable `POST /consent` and cross-client suppression remain the Control Plane's** (#26); the Mobile screen is unchanged when they land. No decline path exists (`GateStatus` has no `declined`); "Agree & Continue" is the only first-party action.
