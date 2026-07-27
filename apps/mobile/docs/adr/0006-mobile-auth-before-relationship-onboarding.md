# Auth Before Relationship Onboarding

_Amended 2026-07-26 by Agent Runtime ADR-0036: Mobile now begins with a
user-authored message and a real Interactive Turn reply. Session Start no longer
produces a bootstrap-guided opening._

Intentive will put a minimal Google OAuth or Apple Identity Gate before the first relationship-forming companion conversation, because continuity is part of the product promise and should exist from the first real exchange across both Expo and the sibling macOS client. The trade-off is that users must sign in before they experience the companion, but the auth step should stay lightweight and practical while the richer onboarding happens conversationally after consent is established.

**Considered Options**

- Let users chat as guests, then ask them to sign in later.
- Put a full setup wizard before the first chat.
- Use minimal Google OAuth or Apple sign-in, a short consent primer, and then relationship onboarding inside chat.

**Consequences**

- Auth copy should explain continuity, not sell features.
- Authentication belongs to the shared Control Plane, not to platform-specific client state.
- Consent Primer completion belongs to the shared relationship in the Control Plane and should not be repeated solely because the user opens a sibling client.
- Notification permission should be deferred until a held intention or follow-up creates a contextual reason.
- Relationship onboarding should produce a held intention, not a completed preference profile.
- Relationship onboarding appears through real Agent Runtime-generated messages in the ordinary Companion Chat UI, not through a separate client screen, alternate shell, client-visible mode flag, or fixture-authored opening message.
- The Control Plane's Session Start creates or loads the Agent Instance and
  returns Routing without invoking the model.
- Mobile does not hardcode an opening. The User may send immediately; the first
  Runtime-authored content is the ordinary Interactive Turn reply.
- Failure of that first Interactive Turn preserves the user-authored message and
  follows normal Runtime retry/reconnect behavior.
- Pre-chat gates may evolve over time; the durable boundary is that they resolve entry into Companion Chat rather than turning runtime onboarding behavior into a separate client destination.
