# ContextSnapshot lives in a shared `snapshot` module

`ContextSnapshot` is shared currency between three consumers: the Context Heartbeat (produces it), the snapshot store (writes it to SQLite), and the Agent Interface (pushes it over HTTPS). Defining it inside any one consumer leaks it into the others as a hidden dependency.

We created a dedicated `snapshot` module at `src-tauri/src/snapshot/` that owns the `ContextSnapshot` type. All consumers import from there. None depend on each other.

## Considered Options

- **Leave in `agent_interface`** — simple short-term, but the store and heartbeat would depend on the HTTPS push module for a type that has nothing to do with pushing. Information leakage; any change to `agent_interface` risks the store.
- **Shared `snapshot` module (chosen)** — each module owns what it knows. `agent_interface` owns push logic, `snapshot_store` owns SQLite logic, `snapshot` owns the domain type. Clean separation, no cross-consumer coupling.
- **Separate type per module** — `StoredSnapshot` in the store, `ContextSnapshot` in the agent interface. These are the same concept split by temporal order (stored vs. sent), not by genuine difference. Conversion boilerplate for zero benefit.

## Consequences

- `ContextSnapshot` is defined once in `src-tauri/src/snapshot/mod.rs`.
- `agent_interface` and `snapshot_store` both import `use crate::snapshot::ContextSnapshot`.
- The Context Heartbeat (future slice) will also import from `snapshot` when it produces one.
- Moving a field on `ContextSnapshot` (e.g. adding `llm_provider` for the transparency UI) is one change in one file, not a hunt across modules.
