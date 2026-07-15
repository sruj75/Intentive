# Scene-driven local frontend foundation

Status: accepted

Date: 2026-07-15

## Context

The previous Mobile Client presentation was coupled to route-per-gate launch resolution, production providers, and an assistant-ui chat wrapper. The new product direction needs a Genie-inspired UX to be evaluated as a complete interactive frontend before Intentive branding and backend wiring are decided. Patching the old presentation would preserve the wrong ownership boundaries.

The reference evidence also shows that E and K are not separate destinations: they are welcome and ready states of one main chat surface.

## Decision

Mount one local `ExperienceController` behind a single Expo Router route. It owns immutable scene state, `chatMode`, overlays, validation, session settings, education progress, composer value, UI timeline, deterministic response timers, and reset/disposal behavior.

Use a UI-specific `ConversationTimelineItem` union. Keep Genie-facing content and the light visual system in replaceable typed configuration. Implement E and K with one conversation component and two modes.

Do not mount authentication, Control Plane, permissions, Contacts, notifications, SecureStore, HTTP, WebSockets, telemetry, or Agent Runtime wiring during this phase. Preserve stable production modules as dormant source for a later adapter-based reconnection.

Remove the obsolete route groups, presentation components, visual assets, assistant-ui dependency/workarounds, Manrope stack, and tests that asserted the superseded UI.

## Consequences

- The complete A-to-L experience is deterministic, resettable, and testable without external systems.
- Future Intentive work can replace content/theme/media without rebuilding the journey chassis.
- Production reconnection needs an explicit translation layer from auth/account/Runtime state into controller events and `ConversationTimelineItem` values.
- Existing production modules may continue to compile and run pure tests, but their presence does not imply a working mounted capability.
- Cold launch intentionally resets to A until a future decision changes the phase boundary.
