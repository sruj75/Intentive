//! Snapshots domain — the Context Snapshot production and delivery pipeline.
//!
//! - `types` — the canonical `ContextSnapshot` / `SessionEndMarker` shapes.
//! - `repo` — the local SQLite Snapshot Store (ADR-0007).
//! - `runtime` — the Context Heartbeat that produces snapshots and the
//!   Agent Interface transport that delivers them (ADR-0005/0008).

pub mod repo;
pub mod runtime;
pub mod types;
