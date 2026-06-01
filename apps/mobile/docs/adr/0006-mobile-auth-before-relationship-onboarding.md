# Auth Before Relationship Onboarding

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
- The Control Plane issues one cross-client-deduplicated Conversation Start Trigger when the relationship first enters chat, while the Agent Runtime decides the bootstrap-guided opening content.
- While that first real message is in flight, the chat shell shows an assistant composing bubble and may preserve user drafting, but sending is deferred until the bootstrap-guided opening message arrives intact.
- Failure of that opening remains in chat as a recoverable retry state; the draft is preserved and the Control Plane must retry idempotently so it cannot deliver duplicate openings.
- Pre-chat gates may evolve over time; the durable boundary is that they resolve entry into Companion Chat rather than turning runtime onboarding behavior into a separate client destination.
