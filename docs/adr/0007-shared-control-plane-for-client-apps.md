# Shared Control Plane for Client Apps

Intentive will route both the Expo app and the sibling macOS client through a shared Control Plane instead of letting each client talk directly to the Deep Agent. The Control Plane owns identity, onboarding continuity, Neon Postgres persistence, client-to-agent routing, and GCP provisioning coordination, while the client apps stay focused on platform-native relationship surfaces.

**Considered Options**

- Let each client integrate directly with the Deep Agent.
- Build separate backends for mobile and macOS.
- Use one shared Control Plane between client apps, Neon Postgres, the GCP Provisioner, and the Deep Agent.

**Consequences**

- A user can authenticate and onboard from either client without forking identity or companion state.
- Client apps should share the same runtime contract and should not encode provisioning or deep-agent ownership locally.
- The Control Plane becomes the deep module boundary for user identity, persistence, routing, and provisioning coordination.
