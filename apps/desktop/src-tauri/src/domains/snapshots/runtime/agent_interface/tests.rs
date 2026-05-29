use super::*;
use crate::domains::snapshots::types::{ContextSnapshot, SessionEndMarker, SessionEndReason};
use chrono::{TimeZone, Utc};
use serde_json::json;
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

#[test]
fn context_snapshot_json_matches_canonical_event_contract() {
    let payload = AgentInterface::context_snapshot_json(&sample_snapshot());

    assert_eq!(
        payload,
        json!({
            "type": "context_snapshot",
            "snapshot_id": "00000000-0000-0000-0000-000000000000",
            "captured_at": "2026-05-19T12:00:00Z",
            "period_start": "2026-05-19T11:59:00Z",
            "period_end": "2026-05-19T12:00:00Z",
            "summary": "user reviewed a PR"
        })
    );

    let object = payload.as_object().expect("payload must be an object");
    assert!(!object.contains_key("id"), "legacy id field must not appear");
}

#[tokio::test]
async fn emit_context_snapshot_returns_network_error_when_endpoint_unreachable() {
    // Port 1 is reliably closed on localhost; reqwest fails connection.
    let endpoint = Url::parse("http://127.0.0.1:1/events").unwrap();
    let agent = AgentInterface::new(endpoint, "test-key".to_string(), reqwest::Client::new());
    let err = agent
        .emit_context_snapshot_event(&sample_snapshot())
        .await
        .expect_err("expected network error");
    assert!(matches!(err, PushError::Network(_)), "got {err:?}");
}

#[tokio::test]
async fn emit_session_end_marker_is_currently_a_no_op() {
    let endpoint = Url::parse("http://127.0.0.1:1/events").unwrap();
    let agent = AgentInterface::new(endpoint, "test-key".to_string(), reqwest::Client::new());
    let marker = SessionEndMarker {
        ended_at: Utc::now(),
        reason: SessionEndReason::UserToggle,
    };

    let result = agent.emit_session_end(&marker).await;
    assert!(result.is_ok(), "session end marker path should be non-fatal");
}
