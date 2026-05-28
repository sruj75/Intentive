# Shared Control Plane for Client Apps

Intentive uses one shared Control Plane for identity, onboarding continuity, Neon Postgres persistence, Routing issuance, and provisioning coordination across both the Mobile Client and the sibling Desktop Client. Clients use Control Plane-issued Routing (Agent Runtime URL + JWT), then connect directly to the Agent Runtime over the shared Protocol WebSocket while the Control Plane stays off the message data path.

**Considered Options**

- Let each client own identity/onboarding/routing locally and integrate with the Agent Runtime independently.
- Build separate backends for mobile and macOS.
- Use one shared Control Plane for identity/lifecycle/routing issuance between client apps, Neon Postgres, the GCP Provisioner, and the Agent Runtime.

**Consequences**

- A user can authenticate and onboard from either client without forking identity or companion state.
- Either client may invite the user to connect its sibling later; the invitation does not make that platform the owner of identity or onboarding progress.
- Skipping an initial sibling-client invitation ends that pre-chat gate without prohibiting a later contextual invitation or user-initiated setup.
- Relationship consent is shared across clients, while device-specific permissions remain contextual to each client.
- Entry into a pre-chat gate or Companion Chat is derived from Control Plane state so a client does not restart or bypass cross-client progress from local flags alone.
- The Control Plane owns one Conversation Start Trigger across clients so first entry cannot produce duplicate runtime-generated onboarding openings.
- The initial Mobile Client skeleton may inject fixture entry decisions behind a Control Plane-shaped Entry Resolver; fixtures are development providers, not a local source of shared onboarding truth or Relationship Onboarding message content.
- Client apps should share the same runtime contract and should not encode provisioning or Agent Runtime ownership locally.
- The Control Plane becomes the deep module boundary for user identity, persistence, routing, and provisioning coordination.
