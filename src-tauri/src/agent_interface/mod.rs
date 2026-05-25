//! Agent Interface — pushes Context Snapshots to the OpenClaw Agent over HTTPS.
//!
//! Callers construct a `ContextSnapshot` (defined in `crate::snapshot`) and hand
//! it to `AgentInterface::push`. Everything else (JSON serialization, the
//! `Authorization: Bearer` scheme, the 10-second timeout, drop-on-failure
//! semantics per ADR-0005) is hidden inside this module — see SPEC.md
//! "Context Snapshot Payload" and ADR-0004.

use std::time::Duration;

use async_trait::async_trait;
use url::Url;

use crate::snapshot::{ContextSnapshot, SessionEndMarker};

/// Boundary the Context Heartbeat depends on for outbound delivery. Snapshot
/// failures are returned only so the store can leave `pushed_at` unset; the
/// heartbeat does not retry them (ADR-0005).
#[async_trait]
pub trait AgentSink: Send + Sync + 'static {
    async fn push_snapshot(&self, snapshot: &ContextSnapshot) -> Result<(), PushError>;
    async fn push_session_end(&self, marker: &SessionEndMarker);
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

/// 10-second push timeout, per SPEC.md "Resolved" open questions.
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(10);

pub struct AgentInterface {
    endpoint: Url,
    api_key: String,
    http: reqwest::Client,
    timeout: Duration,
}

impl AgentInterface {
    pub fn new(endpoint: Url, api_key: String, http: reqwest::Client) -> Self {
        Self {
            endpoint,
            api_key,
            http,
            timeout: DEFAULT_TIMEOUT,
        }
    }

    /// Test-only constructor allowing a shorter timeout — production callers
    /// always use the 10s value via `new`.
    #[cfg(test)]
    pub(crate) fn with_timeout(
        endpoint: Url,
        api_key: String,
        http: reqwest::Client,
        timeout: Duration,
    ) -> Self {
        Self {
            endpoint,
            api_key,
            http,
            timeout,
        }
    }

    /// Send a Session End Marker to the OpenClaw Agent.
    ///
    /// Stubbed until the agent-side contract is defined (ADR-0008): today this
    /// accepts the marker and returns `Ok(())` without an HTTP call.
    /// When the receiver lands, the implementation will POST to a dedicated
    /// session-end endpoint — the heartbeat call site is already correct, so
    /// the change is internal to this method.
    pub async fn send_session_end(&self, marker: &SessionEndMarker) -> Result<(), PushError> {
        let _ = marker;
        Ok(())
    }

    /// POST the snapshot to the configured OpenClaw endpoint.
    /// On any failure the caller does NOT retry (ADR-0005); the snapshot is
    /// dropped from delivery, but its local SQLite row is unaffected.
    pub async fn push(&self, snapshot: &ContextSnapshot) -> Result<(), PushError> {
        let result = self
            .http
            .post(self.endpoint.clone())
            .bearer_auth(&self.api_key)
            .json(snapshot)
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
    async fn push_snapshot(&self, snapshot: &ContextSnapshot) -> Result<(), PushError> {
        self.push(snapshot).await
    }

    async fn push_session_end(&self, marker: &SessionEndMarker) {
        let _ = self.send_session_end(marker).await;
    }
}

#[cfg(test)]
mod tests;
