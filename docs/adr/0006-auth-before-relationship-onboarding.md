# Auth Before Relationship Onboarding

Intentive will put a minimal Google OAuth or Apple Identity Gate before the first relationship-forming companion conversation, because continuity is part of the product promise and should exist from the first real exchange across both Expo and the sibling macOS client. The trade-off is that users must sign in before they experience the companion, but the auth step should stay lightweight and practical while the richer onboarding happens conversationally after consent is established.

**Considered Options**

- Let users chat as guests, then ask them to sign in later.
- Put a full setup wizard before the first chat.
- Use minimal Google OAuth or Apple sign-in, a short consent primer, and then relationship onboarding inside chat.

**Consequences**

- Auth copy should explain continuity, not sell features.
- Authentication belongs to the shared Control Plane, not to platform-specific client state.
- Notification permission should be deferred until a held intention or follow-up creates a contextual reason.
- Relationship onboarding should produce a held intention, not a completed preference profile.
