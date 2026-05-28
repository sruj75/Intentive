//! Runtime event transport boundary for Desktop-produced Protocol events.
//!
//! Callers hand this module canonical `ContextSnapshot` and `SessionEndMarker`
//! domain values. Transport details (current HTTP bridge, auth header, timeout,
//! and failure mapping) stay hidden behind this seam.

use std::time::Duration;

use async_trait::async_trait;
use serde_json::Value;
use url::Url;

use crate::snapshot::{ContextSnapshot, SessionEndMarker};

/// Boundary the Context Heartbeat depends on for outbound delivery.
/// Failures are returned only so the store can leave `pushed_at` unset; the
/// heartbeat does not retry them (ADR-0005).
#[async_trait]
pub trait AgentSink: Send + Sync + 'static {
    async fn emit_context_snapshot(&self, snapshot: &ContextSnapshot) -> Result<(), PushError>;
    async fn emit_session_end_marker(&self, marker: &SessionEndMarker);
}

#[derive(Debug, thiserror::Error)]
pub enum PushError {
    #[error("network failure: {0}")]
    Network(String),
    #[error("request timed out after {0:?}")]
    Timeout(Duration),
    #[error("non-2xx response: {0}")]
    Non2xx(u16),
}

/// 10-second outbound timeout, per SPEC.md "Resolved" open questions.
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(10);

pub struct AgentInterface {
    runtime_endpoint: Url,
    runtime_auth_token: String,
    http: reqwest::Client,
    timeout: Duration,
}

impl AgentInterface {
    pub fn new(runtime_endpoint: Url, runtime_auth_token: String, http: reqwest::Client) -> Self {
        Self {
            runtime_endpoint,
            runtime_auth_token,
            http,
            timeout: DEFAULT_TIMEOUT,
        }
    }

    fn context_snapshot_json(snapshot: &ContextSnapshot) -> Value {
        serde_json::json!({
            "type": "context_snapshot",
            "snapshot_id": snapshot.snapshot_id.to_string(),
            "captured_at": snapshot.captured_at.to_rfc3339(),
            "period_start": snapshot.period_start.to_rfc3339(),
            "period_end": snapshot.period_end.to_rfc3339(),
            "summary": snapshot.summary,
        })
    }

    /// Emit the `session_end_marker` signal.
    ///
    /// The current delivery path is a no-op until #25/#28 land the live
    /// runtime session lifecycle. The caller contract is already canonical,
    /// so this implementation can switch transports internally later.
    pub async fn emit_session_end(&self, marker: &SessionEndMarker) -> Result<(), PushError> {
        let _ = marker;
        Ok(())
    }

    /// Emit a canonical `context_snapshot` event payload.
    /// On any failure the caller does NOT retry (ADR-0005); the local store
    /// row remains and `pushed_at` stays null.
    pub async fn emit_context_snapshot_event(
        &self,
        snapshot: &ContextSnapshot,
    ) -> Result<(), PushError> {
        let result = self
            .http
            .post(self.runtime_endpoint.clone())
            .bearer_auth(&self.runtime_auth_token)
            .json(&Self::context_snapshot_json(snapshot))
            .timeout(self.timeout)
            .send()
            .await;

        let response = match result {
            Ok(r) => r,
            Err(e) if e.is_timeout() => return Err(PushError::Timeout(self.timeout)),
            Err(e) => return Err(PushError::Network(e.to_string())),
        };

        if response.status().is_success() {
            Ok(())
        } else {
            Err(PushError::Non2xx(response.status().as_u16()))
        }
    }
}

#[async_trait]
impl AgentSink for AgentInterface {
    async fn emit_context_snapshot(&self, snapshot: &ContextSnapshot) -> Result<(), PushError> {
        self.emit_context_snapshot_event(snapshot).await
    }

    async fn emit_session_end_marker(&self, marker: &SessionEndMarker) {
        let _ = self.emit_session_end(marker).await;
    }
}

#[cfg(test)]
mod tests;
