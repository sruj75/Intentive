# `AccountState` is assembled by the `identity` composer; domains expose decisions, not the `/me` response

Status: accepted

The `GET /me` response (`AccountState`: `user_id`, `next_gate`, `has_agent_instance`) is composed in one place — `identity`'s `resolveAccount` — which calls each owning domain for its field: `user_id` from `identity` itself, `next_gate` from `gates` (`nextGate(userId)`, #26), and `has_agent_instance` from `agents` (#30). Each domain exposes a narrow _decision_ method; none of them owns the `/me` response shaping. `resolveAccount` is the sole assembler, injected with its collaborators the same way it already takes `verifier` and `users`.

This contradicts the original `ARCHITECTURE.md` codemap wording, which listed `GET /me` shaping under the `gates` domain. Recording the reversal here so the next engineer does not "fix" the composer by moving `/me` assembly into `gates`.

**Considered Options**

- **`identity` composer assembles `AccountState`; domains expose decisions (chosen).** #23 already built `GET /me`, the JWT/principal middleware, and `resolveAccount` as a composer of `verifier` + `users`; the #23 scope-down note explicitly says later tickets must _not_ rebuild the endpoint, only add the gate computation. Keeping `resolveAccount` as the composer means #26 adds one collaborator (`gates`) and #30 adds another (`agents`) with no churn to the HTTP boundary. Each domain stays a deep module that hides one piece of knowledge — `identity` "who are you", `gates` "what's left before chat", `agents` "do you have a Companion" — and none leaks `/me` wire-shape knowledge into another.
- **`gates` owns the whole `/me` response.** Matches the original codemap line, but would require rebuilding the endpoint #23 already shipped, and would force `gates` to know about `user_id` and `has_agent_instance` — fields it does not own — leaking `AccountState`'s shape across `agents` and `identity` into `gates`.

**Consequences**

- `AccountState`'s wire shape is known in exactly one place (`resolveAccount`). Adding or changing a field is a one-module change plus the owning domain's decision method.
- `ARCHITECTURE.md` and `AGENTS.md` were corrected: `gates` owns gate _computation_ (`computeNextGate` / `nextGate`), not `/me` shaping.
- The end-state composer depends on three domains (identity + gates + agents). `has_agent_instance` stays a `false` placeholder until #30 wires the `agents` collaborator.
