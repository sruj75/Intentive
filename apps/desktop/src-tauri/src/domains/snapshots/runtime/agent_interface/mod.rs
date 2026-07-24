//! Runtime event transport boundary for Desktop-produced Protocol events.
//!
//! Issue #31 moves connection ownership into the routing domain but leaves
//! actual snapshot emission for #34. Until then, the heartbeat depends on this
//! inert sink and keeps local rows unmarked instead of sending through the
//! legacy one-shot HTTP path.

use async_trait::async_trait;

use crate::domains::snapshots::types::{ContextSnapshot, SessionEndMarker};

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
    #[error("protocol websocket session is not connected")]
    NotConnected,
    #[error("network failure: {0}")]
    Network(String),
}

#[derive(Debug, Default)]
pub struct NoopAgentSink;

#[async_trait]
impl AgentSink for NoopAgentSink {
    async fn emit_context_snapshot(&self, snapshot: &ContextSnapshot) -> Result<(), PushError> {
        let _ = snapshot;
        Err(PushError::NotConnected)
    }

    async fn emit_session_end_marker(&self, marker: &SessionEndMarker) {
        let _ = marker;
    }
}

#[cfg(test)]
mod tests;
