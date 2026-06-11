use serde::{Deserialize, Serialize};
use url::Url;

/// Routing issued by the Control Plane's `GET /agent`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Routing {
    pub ws_url: Url,
    pub runtime_jwt: String,
    pub agent_instance_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RoutingState {
    SignedOut,
    SignedIn,
    RoutingReady,
    RoutingError,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionState {
    Disconnected,
    Connecting,
    Connected,
    Reconnecting,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeErrorCode {
    ProtocolUnsupported,
    AuthFailed,
    InvalidConnect,
    ServiceUnavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RuntimeHandshakeFrame {
    HelloOk {
        session_snapshot: serde_json::Value,
    },
    RuntimeError {
        code: RuntimeErrorCode,
        message: String,
        #[serde(default)]
        details: Option<serde_json::Value>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ConnectionStatus {
    pub mood: ConnectionMood,
}

/// Plain-English status for Settings and menu surfaces. Raw Routing and
/// Session State stay Rust-internal.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionMood {
    SignedOut,
    Connecting,
    Connected,
    Reconnecting,
    NeedsAttention,
}

pub fn connection_mood(routing_state: RoutingState, session_state: SessionState) -> ConnectionMood {
    match (routing_state, session_state) {
        (RoutingState::SignedOut, _) => ConnectionMood::SignedOut,
        (RoutingState::RoutingError, _) => ConnectionMood::NeedsAttention,
        (_, SessionState::Connected) => ConnectionMood::Connected,
        (_, SessionState::Reconnecting) => ConnectionMood::Reconnecting,
        (_, SessionState::Connecting) => ConnectionMood::Connecting,
        (RoutingState::SignedIn | RoutingState::RoutingReady, SessionState::Disconnected) => {
            ConnectionMood::Connecting
        }
    }
}
