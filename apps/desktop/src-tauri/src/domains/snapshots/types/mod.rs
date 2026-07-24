//! The shared domain type produced by the Context Heartbeat, persisted by the
//! Snapshot Store, and emitted by the runtime event transport boundary.
//!
//! `ContextSnapshot` lives here so that no operational module owns the type
//! — every consumer imports from this neutral location. See ADR-0017.

use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

/// Canonical context snapshot payload fields for the Protocol event boundary.
/// Do not add fields in v1 without a matching `packages/protocol` contract change.
#[derive(Serialize, Clone, Debug)]
pub struct ContextSnapshot {
    pub snapshot_id: Uuid,
    pub captured_at: DateTime<Utc>,
    pub period_start: DateTime<Utc>,
    pub period_end: DateTime<Utc>,
    pub summary: String,
}

/// Signal that a Capture Session ended for any reason (user toggle, quit,
/// ScreenPipe crash). Distinguishes "still capturing, no snapshot yet" from
/// "session over" on the runtime side.
///
/// Field names align with the canonical `session_end_marker` wire shape.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionEndReason {
    UserToggle,
    Quit,
    Crash,
}

#[derive(Serialize, Clone, Debug)]
pub struct SessionEndMarker {
    pub ended_at: DateTime<Utc>,
    pub reason: SessionEndReason,
}
