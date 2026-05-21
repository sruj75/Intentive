use super::*;
use chrono::TimeZone;
use serde_json::json;
use wiremock::matchers::{body_json, header, method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn sample_snapshot() -> ContextSnapshot {
    ContextSnapshot {
        id: Uuid::nil(),
        captured_at: Utc.with_ymd_and_hms(2026, 5, 19, 12, 0, 0).unwrap(),
        period_start: Utc.with_ymd_and_hms(2026, 5, 19, 11, 59, 0).unwrap(),
        period_end: Utc.with_ymd_and_hms(2026, 5, 19, 12, 0, 0).unwrap(),
        summary: "user reviewed a PR".to_string(),
    }
}

async fn agent_pointed_at(server: &MockServer) -> AgentInterface {
    let endpoint = Url::parse(&format!("{}/snapshots", server.uri())).unwrap();
    AgentInterface::new(endpoint, "test-key".to_string(), reqwest::Client::new())
}

#[tokio::test]
async fn push_delivers_request_to_configured_endpoint() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/snapshots"))
        .respond_with(ResponseTemplate::new(200))
        .expect(1)
        .mount(&server)
        .await;

    let agent = agent_pointed_at(&server).await;
    agent
        .push(&sample_snapshot())
        .await
        .expect("push should succeed");
    // wiremock's .expect(1) assertion runs on drop — server going out of scope
    // verifies that exactly one matching request arrived.
}

#[tokio::test]
async fn push_body_matches_exact_five_field_contract() {
    let server = MockServer::start().await;
    let expected = json!({
        "id": "00000000-0000-0000-0000-000000000000",
        "captured_at": "2026-05-19T12:00:00Z",
        "period_start": "2026-05-19T11:59:00Z",
        "period_end": "2026-05-19T12:00:00Z",
        "summary": "user reviewed a PR"
    });
    Mock::given(method("POST"))
        .and(body_json(&expected))
        .respond_with(ResponseTemplate::new(200))
        .expect(1)
        .mount(&server)
        .await;

    let agent = agent_pointed_at(&server).await;
    agent
        .push(&sample_snapshot())
        .await
        .expect("push should succeed");
}

#[tokio::test]
async fn push_returns_network_error_when_endpoint_unreachable() {
    // Port 1 is reliably closed on localhost; reqwest fails connection.
    let endpoint = Url::parse("http://127.0.0.1:1/snapshots").unwrap();
    let agent = AgentInterface::new(endpoint, "test-key".to_string(), reqwest::Client::new());
    let err = agent
        .push(&sample_snapshot())
        .await
        .expect_err("expected network error");
    assert!(matches!(err, PushError::Network(_)), "got {err:?}");
}

#[tokio::test]
async fn push_returns_timeout_error_when_server_is_slow() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(200).set_delay(Duration::from_secs(2)))
        .mount(&server)
        .await;

    let endpoint = Url::parse(&format!("{}/snapshots", server.uri())).unwrap();
    let agent = AgentInterface::with_timeout(
        endpoint,
        "test-key".to_string(),
        reqwest::Client::new(),
        Duration::from_millis(100),
    );
    let err = agent
        .push(&sample_snapshot())
        .await
        .expect_err("expected timeout");
    assert!(matches!(err, PushError::Timeout(_)), "got {err:?}");
}

#[tokio::test]
async fn push_returns_non2xx_error_on_server_failure() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(500))
        .mount(&server)
        .await;

    let agent = agent_pointed_at(&server).await;
    let err = agent
        .push(&sample_snapshot())
        .await
        .expect_err("expected non-2xx error");
    assert!(matches!(err, PushError::Non2xx(500)), "got {err:?}");
}

#[tokio::test]
async fn push_includes_bearer_authorization_header() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(header("Authorization", "Bearer test-key"))
        .respond_with(ResponseTemplate::new(200))
        .expect(1)
        .mount(&server)
        .await;

    let agent = agent_pointed_at(&server).await;
    agent
        .push(&sample_snapshot())
        .await
        .expect("push should succeed");
}
