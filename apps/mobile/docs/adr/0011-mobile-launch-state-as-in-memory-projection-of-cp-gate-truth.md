# Launch State is an in-memory projection of Control-Plane-owned gate truth

**Pre-Chat Gate** state is owned durably by the **Control Plane** (the `gates` domain; Identity Gate and Consent Primer are Cross-Client Gates). The Mobile Client does **not** own or persist gate state. Instead it holds a single **in-memory** `LaunchState` store as a transient _projection_ of that CP-owned truth, used only to drive navigation on this device. The **Launch State Resolver** reads exclusively from this store; `LaunchStateSource` hydrates it from `GET /me`. The mounted production path persists a shared gate first and then reconciles `GET /me`, so navigation never advances from unconfirmed local state.

**Considered Options**

- Round-trip every shared gate advance through the source: the client never shows a gate state CP has not confirmed (chosen for the mounted production path).
- In-memory projection, optimistically updated and reconciled later — rejected for production because `/agent` enforces the Control Plane's current gate truth.
- Durable local gate store on the client — rejected: it would make the client a second source of truth for gate state, contradicting CONTEXT-MAP ("Pre-Chat Gates are owned by the Control Plane") and the parallel Conversation-History invariant ("server-truth, the client persists nothing locally").

**Consequences**

- One durable owner (CP) and one in-process holder (the in-memory store). The resolver reads only the store; `LaunchStateSource` writes into it; the resolver/layout never read the source directly. Keeps "current launch state" in exactly one place per the layer rule.
- Shared gate writes are monotonic but still wait for server confirmation; a failed write or stale reconciliation remains on the retryable gate scene.
- Nothing is written to disk: cold launch starts with an empty store → `RESOLVING` → hydrate from the source. Mirrors the Conversation-History decision.
- Amended 2026-07-25: the mounted production path persists monotonic shared
  gates first and then reconciles `GET /me`; it does not navigate from an
  unconfirmed optimistic projection. Dev/test-only mutators may still advance
  local scenarios without capabilities.
