# Runtime-Shaped Dev Companion

MVP 1 will start with a local development stand-in for the Companion, but the app will call it through a Runtime Adapter shaped around the real Google Cloud Agent Runtime. This lets us build the chat surface, streaming behavior, persistence, and agent-state UI before the production runtime integration is ready, without teaching the app fake semantics that the real companion cannot support.

**Consequences**

- The first chat shell can be built and iterated quickly.
- Runtime auth, deployment, and network details can land after the UI contract is visible.
- The Dev Companion must stay honest: it should support only behaviors the real Agent Runtime is expected to provide.
