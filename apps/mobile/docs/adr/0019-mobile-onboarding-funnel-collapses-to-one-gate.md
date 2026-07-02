# The onboarding funnel collapses to one gate; re-triggerable steps stay their own gates

The omi-modeled launch adds five new screens after the Consent Primer: name, "how did you find us?", grant permissions, set up Mac, and free trial (then chat). The design question is how many of these are **Pre-Chat Gates** in the **Launch State Resolver**. The resolver stays the single spine of gate ordering (ADR 0011/0013/0014); a "slideshow" is only presentation *over* it, not a replacement for it.

Decompose by one question: **does this step independently re-trigger?**

- **No → one collapsed gate.** Name, acquisition source, and grant permissions are a single one-time personalization sequence. They carry no independent server meaning and never re-appear on their own, so modeling them as three resolver gates would over-model. They become **one `onboarding` gate** — the industry-norm "onboarding complete" flag. Their screens step forward with **local state** inside `OnboardingFunnel`, below the resolver's granularity; the resolver reports `MISSING_ONBOARDING` the whole time and only the last step writes `onboarding: "completed"`.
- **Yes → its own gate.** **Consent** (re-prompts on policy change), **Sibling Client Invitation** / set up Mac (a WhatsApp-style linked device, set up anytime), and **Free Trial** (entitlement re-checks on expiry — a lapsed user sees it again, a subscriber never does) each carry independent, re-triggerable server truth. Consent and Sibling are already gates; **Trial becomes one**.

New resolver order (each `null` short-circuits to `RESOLVING`), which preserves the screenshot sequence exactly:
`SIGNED_OUT → MISSING_CONSENT → MISSING_ONBOARDING → SIBLING_INVITATION_PENDING → MISSING_TRIAL → READY_FOR_CHAT`.

**Considered Options** (central decision: gate granularity for the funnel)

- One gate per screen (four new gates: name, source, permissions, trial). Rejected: name/source/permissions have no independent server meaning and never re-trigger; four resolver clauses + four destinations + four dev scenarios is over-modeling a single one-time flow.
- One flag for *everything* new (a single `onboardingComplete` covering trial and Mac too). Rejected: trial and Mac genuinely re-trigger (expiry, connect-anytime) and must be separately resolvable; folding them in loses that and puts a re-checkable entitlement behind a one-shot flag.
- Collapse the one-time funnel into one gate; keep the re-triggerable steps as their own gates (chosen). Two new gates (`onboarding`, `trial`), not four; the screenshot order is preserved and every gate maps to real, independently-resolvable truth.

**Consequences**

- **The funnel is one zone (`/(onboarding)`) with local step state, not three routes.** No `expo-router` navigation inside the zone, so the `onboarding` domain UI stays router-free (the "screens never navigate across gates" rule holds — no gate boundary is crossed between funnel steps). The same local-forward pattern is used for **Get Started → sign-in** inside the signed-out zone.
- **No device persistence (ADR 0011 preserved).** The two new fields are driven by the stub `LaunchStateSource` dev scenarios (`needs-onboarding`, `needs-trial`) — the screen-only-slice pattern ADR 0014 used. The real `GET /me` mapper marks `onboarding` and `trial` `completed` for now, because the Control Plane cannot yet report them; real signed-in users pass straight through both until `packages/api-contract` adds an `onboarding` `next_gate` value and a trial entitlement. Marked `TODO` in the mapper.
- **The Grant Permissions ask is injected, not imported.** Onboarding importing the `notifications` domain would fail the cross-domain architecture lint, so the step takes an injected `requestNotificationPermission`; the `(onboarding)` route (a composition point, not layer-linted) wires the real `expo-notifications` port, and tests inject a fake. This is also where the notification *prompt* moves earlier than "first chat entry" (superseding that clause of ADR 0006 — see [ADR 0018](0018-mobile-pre-chat-funnel-minimum.md)); token registration still happens around chat entry.
- **The name value is intentionally not modeled** in Launch State — only the funnel's done-ness. Persisting the name is a later Control Plane concern.
- **Deferred, behind `TODO(polish)` markers:** free-trial billing/StoreKit + real entitlements; real Intentive hero art (never omi's pendant photos); acquisition-source analytics sink; and the real Control-Plane `next_gate`/entitlement persistence.
