# Shared Control Plane for Client Apps

Intentive will route both the Expo app and the sibling macOS client through a shared Control Plane instead of letting each client talk directly to the Deep Agent. The Control Plane owns identity, onboarding continuity, Neon Postgres persistence, client-to-agent routing, and GCP provisioning coordination, while the client apps stay focused on platform-native relationship surfaces.

**Considered Options**

- Let each client integrate directly with the Deep Agent.
- Build separate backends for mobile and macOS.
- Use one shared Control Plane between client apps, Neon Postgres, the GCP Provisioner, and the Deep Agent.

**Consequences**

- A user can authenticate and onboard from either client without forking identity or companion state.
- Either client may invite the user to connect its sibling later; the invitation does not make that platform the owner of identity or onboarding progress.
- Skipping an initial sibling-client invitation ends that pre-chat gate without prohibiting a later contextual invitation or user-initiated setup.
- Relationship consent is shared across clients, while device-specific permissions remain contextual to each client.
- Entry into a pre-chat gate or Companion Chat is derived from Control Plane state so a client does not restart or bypass cross-client progress from local flags alone.
- The Control Plane owns one Conversation Start Trigger across clients so first entry cannot produce duplicate runtime-generated onboarding openings.
- The initial Mobile Surface skeleton may inject fixture entry decisions behind a Control Plane-shaped Entry Resolver; fixtures are development providers, not a local source of shared onboarding truth or Relationship Onboarding message content.
- Client apps should share the same runtime contract and should not encode provisioning or deep-agent ownership locally.
- The Control Plane becomes the deep module boundary for user identity, persistence, routing, and provisioning coordination.
