use super::*;
use crate::domains::snapshots::types::{ContextSnapshot, SessionEndMarker, SessionEndReason};
use chrono::{TimeZone, Utc};
use uuid::Uuid;

fn sample_snapshot() -> ContextSnapshot {
    ContextSnapshot {
        snapshot_id: Uuid::nil(),
        captured_at: Utc.with_ymd_and_hms(2026, 5, 19, 12, 0, 0).unwrap(),
        period_start: Utc.with_ymd_and_hms(2026, 5, 19, 11, 59, 0).unwrap(),
        period_end: Utc.with_ymd_and_hms(2026, 5, 19, 12, 0, 0).unwrap(),
        summary: "user reviewed a PR".to_string(),
    }
}

#[tokio::test]
async fn noop_sink_leaves_snapshot_unmarked_until_live_session_send_lands() {
    let sink = NoopAgentSink;
    let err = sink
        .emit_context_snapshot(&sample_snapshot())
        .await
        .expect_err("expected no-op sink to report no live session");
    assert!(matches!(err, PushError::NotConnected), "got {err:?}");
}

#[tokio::test]
async fn emit_session_end_marker_is_currently_a_no_op() {
    let sink = NoopAgentSink;
    let marker = SessionEndMarker {
        ended_at: Utc::now(),
        reason: SessionEndReason::UserToggle,
    };

    sink.emit_session_end_marker(&marker).await;
}
