//! The shared domain type produced by the Context Heartbeat, persisted by the
//! Snapshot Store, and pushed by the Agent Interface.
//!
//! `ContextSnapshot` lives here so that no operational module owns the type
//! — every consumer imports from this neutral location. See ADR-0017.

use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

/// The exact payload shape consumed by the OpenClaw Agent receiver.
/// Field order, naming, and the absence of additional fields are all part of
/// the contract locked in Issue #2 — do not extend in v1.
#[derive(Serialize, Clone, Debug)]
pub struct ContextSnapshot {
    pub id: Uuid,
    pub captured_at: DateTime<Utc>,
    pub period_start: DateTime<Utc>,
    pub period_end: DateTime<Utc>,
    pub summary: String,
}

/// Signal that a Capture Session ended for any reason (user toggle, quit,
/// ScreenPipe crash). Distinguishes "still capturing, no snapshot yet" from
/// "session over" on the agent side.
///
/// Payload shape is intentionally minimal — the full contract is deferred
/// until the OpenClaw Agent receiver is defined (ADR-0008). Today the marker
/// carries only enough to identify the event; future fields (reason,
/// last_snapshot_id, etc.) belong here when that contract lands.
#[derive(Serialize, Clone, Debug)]
pub struct SessionEndMarker {
    pub id: Uuid,
    pub session_ended_at: DateTime<Utc>,
}
