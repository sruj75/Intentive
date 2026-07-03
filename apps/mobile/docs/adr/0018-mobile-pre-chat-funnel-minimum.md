# Pre-Chat may carry the funnel minimum — narrowly superseding ADR 0006

ADR 0006 established **auth before relationship onboarding**: a minimal Identity Gate and a short Consent Primer before the first companion conversation, with the *richer* relationship onboarding happening conversationally in-chat, not on client screens. That durable boundary still holds — deep relationship-building (held intentions, memory, follow-ups) remains **Agent Runtime**-authored inside **Companion Chat**, never a client screen.

This ADR narrows one clause of 0006. Modeling the Mobile Client's launch on the battle-tested consumer-onboarding arc (omi, and the broader ChatGPT/Instagram/Opal pattern), pre-chat now carries a **funnel minimum**: a name, a "how did you find us?", a notification-permission ask, and a cosmetic free-trial offer, in addition to identity and consent. These are lightweight, one-time, and product-standard — they are *not* relationship-building and do not produce a preference profile.

**Considered Options** (central decision: where does the light personalization funnel live?)

- Keep 0006 literal — nothing but identity + consent before chat; put name/permission/trial in-chat or in Settings. Rejected: it drops the industry-standard onboarding funnel every comparable consumer app ships, and an empty first chat with no personalization is a weaker cold-start than the reference apps.
- Move *all* onboarding — including relationship-building — back onto client screens. Rejected: this reverses 0006's core insight (relationship onboarding is Runtime-authored chat content, not a client wizard) and re-introduces the "separate client screen / alternate shell" anti-pattern 0006 forbids.
- Carry only the *funnel minimum* on pre-chat screens; keep relationship onboarding in-chat (chosen). Preserves 0006's durable boundary while matching the battle-tested arc.

**Consequences**

- 0006's list "Pre-chat gates may evolve over time; the durable boundary is that they resolve entry into Companion Chat" is exactly the seam we use — the funnel is new gates that resolve entry, not a new destination competing with chat.
- 0006's "Notification permission should be deferred until a held intention or follow-up creates a contextual reason" is superseded by the **Grant Permissions** step: the ask now fires in the onboarding funnel, omi-style. Registering the Expo Push Token still happens around first chat entry (the port does not re-prompt once permission is decided), so only the *prompt* moves earlier. See [ADR 0019](0019-mobile-onboarding-funnel-collapses-to-one-gate.md).
- Relationship onboarding is unchanged: still a Runtime-authored **Protected Opening** in ordinary chat, never a client screen. The funnel adds no relationship state and no preference profile.
- The funnel decomposition (which steps are one gate vs. their own gate, and why nothing persists on device) is [ADR 0019](0019-mobile-onboarding-funnel-collapses-to-one-gate.md); the Consent Primer's redefinition to a Data & Privacy acceptance is [ADR 0020](0020-mobile-consent-primer-is-data-and-privacy-acceptance.md).
