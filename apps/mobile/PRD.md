# Intentive Expo V1 Client PRD

## Problem Statement

Users need a mobile Intentive surface that lets them authenticate, consent to the companion relationship, optionally connect the macOS Client for richer work context, and then enter a calm chat-first experience with the Execution Companion. Without this Expo client, the broader Intentive system has no iOS-native relationship surface for Companion Chat, no lightweight account/setup recovery surface, and no fast path for validating the Liquid Glass chat shell before deeper runtime integration.

The app must move quickly without becoming a generic ChatGPT clone, productivity dashboard, or task manager. It should feel native, quiet, continuous, and capability-honest while leaving the Deep Agent, Control Plane, provisioning, persistence sync, and proactive autonomy outside the client.

## Solution

Build Intentive Expo V1 as an iOS-first Client App with a native onboarding sequence and a chat-first main experience.

The current V1 client sequence is:

1. Launch resolves auth, session, and setup state.
2. Signed out users see a minimal Identity Gate with Google OAuth or Apple sign-in.
3. Signed-in users see a tiny native Consent Primer before the first companion conversation.
4. Users see a guided but skippable macOS Setup invitation before their first conversation, unless a specific capability cannot work honestly without it.
5. Users enter the full-screen Liquid Glass Chat Shell, where messages come from the Agent Runtime; when bootstrap is required, the companion generates its first Relationship Onboarding message there.
6. After Relationship Onboarding completes in the runtime, users remain in that same Companion Chat UI with no client-side mode switch.
7. Settings/Account lives in an Account Surface opened from a visible but quiet Account Affordance.

MVP 1 will spike `assistant-ui/native` as a replaceable Chat Primitive Engine behind Intentive Chat Components. The app owns the Liquid Glass shell, message visuals, Liquid Glass Composer, Runtime Adapter boundary, native onboarding screens, Account Surface, and Conversation Store boundary.

## User Stories

1. As a new mobile user, I want to open the Intentive app and understand that I am entering a companion relationship, so that the first experience feels trustworthy rather than generic.
2. As a signed-out user, I want a minimal Google OAuth or Apple sign-in step, so that continuity can exist from my first real conversation.
3. As a signed-out user, I want auth copy to explain continuity, so that sign-in feels purposeful instead of like account friction.
4. As a returning user, I want the app to resolve my existing session on launch, so that I can return directly to the right state.
5. As a returning user with incomplete setup, I want the app to resume the next setup step, so that I do not get stranded or reset.
6. As a user who already started on the macOS Client, I want the Mobile Surface to recognize my shared progress, so that installing iPhone does not restart the relationship.
7. As a user beginning the Intentive relationship on any client, I want a short Consent Primer before the first companion conversation, so that memory and follow-ups feel user-approved rather than mysterious.
8. As a first-time signed-in user, I want the Consent Primer to be a native screen, so that the experience feels polished and reliable.
9. As a privacy-sensitive user, I want the Consent Primer to explain memory, follow-ups, and user control plainly, so that I understand what I am agreeing to.
10. As a user, I want notification permission deferred until there is a contextual reason, so that first launch does not feel like a permission grab.
11. As a user who already consented on the macOS Client, I want iPhone to avoid repeating relationship consent while still asking for iPhone-specific permissions only in context, so that setup feels coherent and trustworthy.
12. As a user setting up Intentive, I want the Expo app to explain that connecting the macOS Client can provide richer context about how I work, so that I understand its value without being forced through setup first.
13. As a user whose mobile chat can still work without the macOS Client, I want to continue on iPhone and connect my Mac later, so that I can begin the relationship immediately.
14. As a user attempting a capability that genuinely needs the macOS Client, I want the app to require connection at that moment, so that it does not pretend the companion can do things it cannot do.
15. As a user who skipped macOS setup, I want that choice to remove setup from ordinary launch gating, so that Intentive does not nag me before chat.
16. As a user who later reaches a moment where Mac context would materially help, I want a concrete invitation to connect it then, so that the value is clear.
17. As a user who skipped or lost macOS setup, I want setup recovery in Settings/Account, so that I can fix it later without searching through chat.
18. As a user, I want the actual Execution Companion to begin Relationship Onboarding inside the same Companion Chat UI as ongoing conversation, so that onboarding is a real conversation rather than client-authored filler.
19. As a user, I want the first useful onboarding artifact to be a Held Intention, so that the companion starts with something I actually care about.
20. As a user, I want the app to open to one continuous Companion Chat after setup, so that returning to Intentive feels like returning to an ongoing relationship.
21. As a user, I want no dashboard, task board, streaks, or bottom tabs in V1, so that the app does not feel like another productivity system to manage.
22. As a user, I want the main chat to use a full-screen Liquid Glass Chat Shell, so that conversation feels primary and chrome recedes.
23. As a user, I want the message input to be a floating bottom Liquid Glass Composer, so that sending messages feels native, reachable, and visually integrated.
24. As a keyboard user, I want the composer to move safely with the keyboard, so that typing never hides my input or latest message.
25. As a mobile user, I want the composer to respect the bottom safe area, so that it remains comfortable on modern iPhones.
26. As a user reading a long thread, I want the message list to maintain proper scroll insets around the composer, so that content is not hidden behind the input surface.
27. As a user, I want assistant and user messages to match Intentive's visual language, so that the app does not feel like a pasted-in vendor chat UI.
28. As a user, I want streaming assistant responses, so that the companion feels responsive.
29. As a user, I want clear loading, error, retry, and delivery states, so that I understand what happened when a message fails.
30. As a user, I want a subtle Agent State expression, so that I can tell whether the companion is available, thinking, following up, or paused.
31. As a user, I want continuity cues to appear lightly in the conversation, so that remembered context feels legible without becoming a memory dashboard.
32. As a user, I want future follow-up or nonstandard companion events to fit into the chat surface, so that proactive behavior can evolve without redesigning the app shell.
33. As a user, I want Settings/Account to be reachable from a visible but quiet affordance, so that logout and setup recovery remain discoverable without a header.
34. As a user, I want Settings/Account to open as a sheet-like utility surface, so that it does not become a primary app destination.
35. As a user, I want Settings/Account to show my signed-in identity, so that I know which account owns my companion continuity.
36. As a user, I want to log out from Settings/Account, so that basic account control is available.
37. As a user, I want Settings/Account to show macOS setup and connection status, so that I can see whether the sibling client is ready.
38. As a user, I want Settings/Account to show runtime or Control Plane connection status, so that capability issues are not mysterious.
39. As a user, I want Settings/Account to show app version and debug information, so that support and testing are practical.
40. As a user, I want support access from Settings/Account, so that I have somewhere to go if setup or chat fails.
41. As a user, I want the Account Affordance to stay visible but quiet, so that it is discoverable without competing with Companion Chat.
42. As a designer, I want the Account Affordance location to remain TBD until composer and keyboard behavior are visible, so that we do not crowd the bottom controls prematurely.
43. As a developer, I want `assistant-ui/native` isolated as a replaceable Chat Primitive Engine, so that the app can move fast without surrendering product identity.
44. As a developer, I want Intentive Chat Components to wrap vendor primitives, so that message rows, composer visuals, and shell behavior stay locally owned.
45. As a developer, I want a Runtime Adapter boundary, so that the client can speak through the Control Plane without embedding Deep Agent assumptions.
46. As a developer, I want a Dev Companion behind the same Runtime Adapter contract, so that MVP 1 can be built before production runtime integration is ready.
47. As a developer, I want a Conversation Store boundary with structured Conversation Messages, so that local persistence can later be replaced or synced without changing the chat domain.
48. As a developer, I want an Entry Resolver shaped like the future Control Plane response and backed by demo fixtures initially, so that launch flow can be built without pretending local state owns shared progress or bootstrap conversation content.
49. As a developer, I want the Control Plane to send one cross-client-deduplicated Conversation Start Trigger when the user first enters chat, so that the real Agent Runtime initiates Relationship Onboarding only once.
50. As a user entering Companion Chat for the first time, I want to see that my companion is composing its real opening message while I can already draft, so that onboarding feels live without interrupting the companion's introduction.
51. As a user whose first companion opening fails, I want an in-chat retry that preserves my draft and does not produce duplicate greetings, so that recovery remains trustworthy.
52. As a tester, I want the assistant-ui/native spike to have explicit exit criteria, so that the team knows when to keep or eject the dependency.
53. As a future implementer, I want the docs to preserve the no-header/no-tabs shell decision, so that I do not accidentally rebuild a conventional mobile navigation frame.

## Implementation Decisions

- Build the V1 client as a native Expo app focused on the Mobile Surface, not as an Agent Runtime.
- Use the current V1 client sequence: Launch, Signed Out, Consent Primer, macOS Setup invitation, Companion Chat, Settings/Account.
- Model pre-chat gating as an evolvable resolver boundary: future product versions may add, remove, reorder, or contextualize gates without introducing a separate Relationship Onboarding destination.
- Implement an Entry Resolver contract shaped around the future Control Plane entry response; in the initial skeleton, inject fixture-backed scenarios rather than requiring live network integration.
- Render Identity Gate, Consent Primer, and macOS Setup as native Expo screens in V1.
- Keep durable auth, onboarding, setup completion, and authoritative entry destination state in the Control Plane so either Client App can resume the same relationship.
- Have the Control Plane own one cross-client-deduplicated Conversation Start Trigger after the relationship first enters Companion Chat; the Agent Runtime generates the opening message from bootstrap behavior when required.
- Require the Identity Gate before Relationship Onboarding so continuity exists from the first real conversation.
- Show the Consent Primer as a separate tiny pre-chat screen only until relationship-level consent has been recorded by the Control Plane; do not repeat it merely because the user opens a sibling Client App.
- Keep device-specific capabilities, including iPhone notification access, as Contextual Permissions requested by the client only when the relationship creates a reason for them.
- Put the macOS Setup invitation after the Consent Primer and before the first Companion Chat conversation.
- Treat macOS Setup as guided but skippable whenever mobile Companion Chat remains meaningful; block only a capability that cannot work honestly without the sibling macOS Client.
- Treat skipping macOS Setup as completion of its pre-chat invitation rather than permanent rejection; permit later re-invitation only when a concrete conversational need makes Mac context useful or the user initiates setup from the Account Surface.
- Render real Agent Runtime messages in the ordinary Liquid Glass Chat Shell; Relationship Onboarding is expressed by runtime-generated conversation, not a separate client UI, client mode flag, or fixture-authored first message.
- During the bootstrap-guided opening message, render the same assistant composing bubble used for an active assistant response and keep the Liquid Glass Composer editable, but defer send until the opening arrives.
- If the protected onboarding opening fails, replace the composing bubble with an in-chat recoverable error and one retry action; preserve the typed draft and keep send deferred until the opening succeeds or a later explicit escape path is designed.
- Require the later Control Plane Conversation Start Trigger implementation to support idempotent retry so delayed and retried starts cannot produce duplicate opening messages.
- Leave day-to-day interruption and concurrent-send behavior for later companion-initiated messages TBD; do not infer it from the protected onboarding opening.
- Keep macOS setup recovery and status in the Account Surface after onboarding.
- Treat macOS Setup as the Mobile Surface's sibling-client invitation; the macOS Client may symmetrically invite users to connect mobile without changing who owns identity or onboarding progress.
- Use the Liquid Glass Chat Shell for the main iOS frame.
- Do not use a conventional header, bottom-tab navigation, dashboard, task board, streaks, or multi-tab productivity shell in V1.
- Use a visible but quiet Account Affordance to open the Account Surface.
- Leave Account Affordance location TBD until composer, keyboard, and safe-area behavior are visible.
- Prefer a top corner while Account Affordance remains pure account/settings utility.
- Consider bottom-adjacent Account Affordance placement only if it becomes part of active chat control.
- Build the Account Surface as a sheet-like utility surface rather than a primary tab.
- Include signed-in identity, logout, macOS setup/connection status, Control Plane or runtime connection status, app version/debug, support, and recovery in the Account Surface.
- Build the message input as a bottom floating Liquid Glass Composer.
- Treat keyboard movement, bottom safe area, reachability, and chat-scroll insets as first-order layout constraints for the Composer.
- Spike `assistant-ui/native` as a replaceable Chat Primitive Engine for thread, message, composer, streaming, retry, and backend-adapter mechanics.
- Wrap `assistant-ui/native` behind Intentive Chat Components rather than adopting vendor example visuals.
- Own message rows, Liquid Glass Composer, Liquid Glass Chat Shell, onboarding, Account Surface, Runtime Adapter, and Conversation Store locally.
- Eject from `assistant-ui/native` early if it cannot support full message customization, the floating Liquid Glass Composer, custom runtime/backend adapters, loading/error/streaming states, or future nonstandard event rendering.
- Implement a Runtime Adapter boundary that sends user messages through the Control Plane and receives assistant responses, state, and follow-up events.
- Implement a Dev Companion behind the Runtime Adapter for MVP 1 development only.
- Keep Entry Resolver fixtures explicitly developmental: they demonstrate server-owned entry outcomes and are later replaced by a live Control Plane provider without changing client route semantics; they do not stand in for generated companion messages.
- Implement a Conversation Store boundary with structured Conversation Messages containing stable identity, role, timestamps, delivery status, and runtime metadata.
- Start with local on-device conversation persistence; backend sync is a later Conversation Store implementation, not a different product model.
- Make Agent State legible in the UI without implying the companion acted locally.
- Keep future Follow-Up and continuity events lightweight and conversational in V1.

## Testing Decisions

- Good tests should assert external behavior and user-visible state transitions, not the internal implementation details of assistant-ui/native or individual style objects.
- Test the current V1 launch resolver outcomes: signed out, signed in with missing consent, signed in needing the macOS Setup invitation, and entry into Companion Chat.
- Test these outcomes through the Entry Resolver contract using fixture providers rather than ad hoc screen-local booleans.
- Keep resolver tests table-driven around pre-chat gates and the Companion Chat destination so adding or removing a future gate does not require a new chat surface model.
- Test that server-owned progress completed from the macOS Client causes the Mobile Surface to enter the correct next gate or Companion Chat destination rather than restarting local onboarding.
- Test that a user who completed the Consent Primer on macOS skips repeated relationship consent on iPhone while remaining eligible for later iPhone-specific Contextual Permission prompts.
- Test pre-chat progression through Identity Gate, Consent Primer, macOS Setup invitation, and entry into Companion Chat without a separate Relationship Onboarding client destination.
- Reserve later runtime-integration contract coverage for proving that one Conversation Start Trigger produces one Agent Runtime-generated opening message even when multiple Client Apps enter the relationship.
- Reserve later runtime-integration coverage for the protected onboarding opening: a real in-flight first response displays the composing affordance, preserves a typed draft, and does not allow send until the opening arrives.
- Reserve later runtime-integration coverage for Opening Recovery: a failed protected opening exposes one retry, preserves draft text, keeps send deferred, and remains idempotent if the original response arrives late.
- Test that macOS Setup can be skipped when mobile chat is viable and required only when a requested capability depends on the macOS Client.
- Test that skipping macOS Setup prevents it from recurring as an ordinary launch gate while preserving later contextual re-invitation and Account Surface recovery.
- Test that Settings/Account remains reachable from the Liquid Glass Chat Shell and exposes logout plus setup/connection status.
- Test that the Account Affordance is discoverable without requiring a hidden gesture.
- Test Runtime Adapter behavior through contract tests against the Dev Companion: send message, stream response, surface error, retry, and expose Agent State.
- Test Conversation Store behavior with structured Conversation Messages: create, append, update delivery status, preserve timestamps, and reload thread history.
- Test Intentive Chat Components through rendered behavior: custom user message, assistant message, streaming response, loading state, error state, and retry action.
- Test that the Liquid Glass Composer remains usable around keyboard and safe-area transitions.
- Test that chat scroll insets keep the latest content visible above the Composer.
- Test that notification permission is not requested during initial launch or before a Held Intention or Follow-Up creates a contextual reason.
- Test the assistant-ui/native spike with explicit evaluation checks rather than treating package installation as success.
- For visual polish, use screenshot or component-render checks for light/dark appearance, Dynamic Type, and composer/account affordance overlap.
- Prior art in this repo is documentation-first; implementation tests should be introduced alongside the first Expo modules rather than retrofitted later.

## Out of Scope

- Building the Deep Agent runtime inside the Expo app.
- Bypassing the Control Plane to talk directly to the Deep Agent.
- Production GCP provisioning from the client.
- Live network-backed Control Plane entry resolution in the initial skeleton slice; issue #2 should establish its typed boundary and fixture scenarios only.
- Fixture-authored Relationship Onboarding messages or any client-visible bootstrap/onboarding mode; real onboarding messages belong to later Agent Runtime integration.
- Live Conversation Start Trigger delivery and cross-client deduplication; issue #2 records the boundary but does not implement runtime initiation.
- Live Opening Recovery retry/idempotency behavior; issue #2 may render the shell state but runtime-safe retry belongs to the integration slice.
- Full backend persistence and cross-device sync for Conversation Messages.
- A complete end-user memory editor.
- Dashboards, task boards, streaks, calendars, or productivity-app scaffolding.
- Bottom-tab navigation.
- Conventional header navigation.
- Multi-agent views.
- A full notification system.
- Tool-backed autonomous actions.
- Rich follow-up scheduling and cleanup beyond lightweight V1 continuity cues.
- Finalizing Account Affordance top-vs-bottom placement before composer and keyboard behavior are visible.
- Treating `assistant-ui/native` as the product design system.

## Further Notes

- The PRD follows the current domain language in CONTEXT.md and ADRs 0001-0009.
- The implementation should preserve capability honesty: the Mobile Surface must not imply the Execution Companion read, acted, scheduled, or connected anything unless the Control Plane or runtime actually did.
- The fastest path is to build the V1 client in small slices: native shell and launch state, auth/consent/setup flow, chat primitive spike, Liquid Glass Chat Shell, Runtime Adapter and Dev Companion, Conversation Store, then Account Surface recovery/status.
- The first shipped version should feel simple: one chat-first home, one composer, one quiet Account Affordance, and native setup screens that get out of the way quickly.
