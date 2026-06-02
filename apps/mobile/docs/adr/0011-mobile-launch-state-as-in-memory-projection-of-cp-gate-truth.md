# Launch State is an in-memory projection of Control-Plane-owned gate truth

**Pre-Chat Gate** state is owned durably by the **Control Plane** (the `gates` domain; Identity Gate and Consent Primer are Cross-Client Gates). The Mobile Client does **not** own or persist gate state. Instead it holds a single **in-memory** `LaunchState` store as a transient *projection* of that CP-owned truth, used only to drive navigation on this device. The **Launch State Resolver** reads exclusively from this store; `LaunchStateSource` (stub now, `GET /me` later) hydrates and reconciles it; a gate completing updates it **optimistically** (instant redirect) while the durable write to CP happens in the background.

**Considered Options**

- Round-trip every gate advance through the source: the client never shows a gate state CP has not confirmed. Cleanest literal ownership, but a network stall on every "Next" plus spinner/error UX on a trivial action.
- In-memory projection, optimistically updated, reconciled on hydration (chosen).
- Durable local gate store on the client — rejected: it would make the client a second source of truth for gate state, contradicting CONTEXT-MAP ("Pre-Chat Gates are owned by the Control Plane") and the parallel Conversation-History invariant ("server-truth, the client persists nothing locally").

**Consequences**

- One durable owner (CP) and one in-process holder (the in-memory store). The resolver reads only the store; `LaunchStateSource` writes into it; the resolver/layout never read the source directly. Keeps "current launch state" in exactly one place per the layer rule.
- Optimism is safe because the v1 gates are **monotonic** — once `completed`/`skipped`, they do not revert — so a locally-set value cannot be harmfully contradicted on reconcile. A server-reversible gate would require conflict handling and likely the round-trip model instead.
- Nothing is written to disk: cold launch starts with an empty store → `RESOLVING` → hydrate from the source. Mirrors the Conversation-History decision.
- The optimistic write path (gate completion mutates the store, then persists) is the seam #19–#21 inherit: the dev-harness "advance" buttons in #18 write the store directly; real gate UIs replace the button, keeping the same write call. The durable `POST /consent` etc. arrives with #23/#26.
