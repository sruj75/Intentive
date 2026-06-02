# Runtime JWT is the pass-through Neon Auth token, not a Control-Plane-minted token

Status: accepted

The `runtime_jwt` the Control Plane returns from `GET /agent` (Routing) is the client's **Neon Auth user JWT passed through** — the Control Plane does not sign a token with its own key. The Agent Runtime verifies it on the WebSocket `connect` handshake using the single shared Neon Auth JWKS verifier (`packages/providers`, issue #15), the same verifier the Control Plane uses on its public endpoints. "Mint" in the PRD and issue wording means "issue / hand back," not "sign with a Control-Plane key." There is no Control-Plane signing key and no second verifier.

**Considered Options**

- **Pass-through the Neon Auth token (chosen).** One sanctioned verifier, no new keys, no new verification path. The token already proves the one thing the Runtime needs at connect: which User this is.
- **Control Plane mints its own token with its own signing key.** Requires the Control Plane to hold and rotate a signing key (or host its own JWKS) and the Agent Runtime to run a *second* verifier next to the Neon Auth one. Rejected for v1: it adds key management and a deployable-local auth path the codebase explicitly forbids ("one sanctioned verifier"), and buys nothing while both services are first-party.

**Consequences**

- Issue #17 criterion 5 drops "runtime JWT signing key" from the enumerated config — no such key exists. The auth config is just the Neon Auth JWKS URL + issuer + audience (already needed by `identity`/#23).
- The `runtime_jwt` field name in `packages/api-contract` is kept (clients #31/#33 already consume it); it names "the JWT you present to reach the Runtime," which the pass-through token is.
- If the Control Plane ever needs to assert claims Neon Auth does not carry (e.g. a Runtime-scoped audience or short-lived routing token), that is a deliberate future reversal and earns its own ADR — it is not a silent default.
