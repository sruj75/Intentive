use std::time::Duration;

use crate::domains::routing::config::{BACKOFF_BASE, BACKOFF_CAP};
use crate::domains::routing::types::{RoutingState, RuntimeErrorCode, SessionState};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RoutingEvent {
    LoginTokenStored,
    LoginTokenCleared,
    RoutingFetched,
    RoutingFetchFailed,
    ConnectStarted,
    HandshakeAccepted,
    RuntimeRejected(RuntimeErrorCode),
    TransportDropped,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReconnectCause {
    RuntimeError(RuntimeErrorCode),
    TransportDropped,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReconnectDecision {
    RetrySameBadge,
    RefreshRouting,
    Stop,
}

pub fn transition(
    routing_state: RoutingState,
    session_state: SessionState,
    event: RoutingEvent,
) -> (RoutingState, SessionState) {
    match event {
        RoutingEvent::LoginTokenStored => (RoutingState::SignedIn, SessionState::Disconnected),
        RoutingEvent::LoginTokenCleared => (RoutingState::SignedOut, SessionState::Disconnected),
        RoutingEvent::RoutingFetched => (RoutingState::RoutingReady, session_state),
        RoutingEvent::RoutingFetchFailed => {
            (RoutingState::RoutingError, SessionState::Disconnected)
        }
        RoutingEvent::ConnectStarted => (routing_state, SessionState::Connecting),
        RoutingEvent::HandshakeAccepted => (routing_state, SessionState::Connected),
        RoutingEvent::RuntimeRejected(RuntimeErrorCode::ProtocolUnsupported)
        | RoutingEvent::RuntimeRejected(RuntimeErrorCode::InvalidConnect) => {
            (RoutingState::RoutingError, SessionState::Disconnected)
        }
        RoutingEvent::RuntimeRejected(RuntimeErrorCode::AuthFailed) => {
            (RoutingState::SignedIn, SessionState::Reconnecting)
        }
        RoutingEvent::RuntimeRejected(RuntimeErrorCode::ServiceUnavailable)
        | RoutingEvent::TransportDropped => (routing_state, SessionState::Reconnecting),
    }
}

pub fn reconnect_decision(cause: ReconnectCause) -> ReconnectDecision {
    match cause {
        ReconnectCause::TransportDropped => ReconnectDecision::RetrySameBadge,
        ReconnectCause::RuntimeError(RuntimeErrorCode::AuthFailed) => {
            ReconnectDecision::RefreshRouting
        }
        ReconnectCause::RuntimeError(RuntimeErrorCode::ServiceUnavailable) => {
            ReconnectDecision::RetrySameBadge
        }
        ReconnectCause::RuntimeError(RuntimeErrorCode::ProtocolUnsupported)
        | ReconnectCause::RuntimeError(RuntimeErrorCode::InvalidConnect) => ReconnectDecision::Stop,
    }
}

pub fn backoff_delay(attempt: u32) -> Duration {
    let factor = 1u32.checked_shl(attempt.min(16)).unwrap_or(u32::MAX);
    BACKOFF_BASE.saturating_mul(factor).min(BACKOFF_CAP)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn routing_and_session_dials_move_independently() {
        let mut state = (RoutingState::SignedOut, SessionState::Disconnected);
        state = transition(state.0, state.1, RoutingEvent::LoginTokenStored);
        assert_eq!(state, (RoutingState::SignedIn, SessionState::Disconnected));

        state = transition(state.0, state.1, RoutingEvent::RoutingFetched);
        assert_eq!(
            state,
            (RoutingState::RoutingReady, SessionState::Disconnected)
        );

        state = transition(state.0, state.1, RoutingEvent::ConnectStarted);
        assert_eq!(
            state,
            (RoutingState::RoutingReady, SessionState::Connecting)
        );

        state = transition(state.0, state.1, RoutingEvent::HandshakeAccepted);
        assert_eq!(state, (RoutingState::RoutingReady, SessionState::Connected));

        state = transition(state.0, state.1, RoutingEvent::TransportDropped);
        assert_eq!(
            state,
            (RoutingState::RoutingReady, SessionState::Reconnecting)
        );
    }

    #[test]
    fn routing_error_does_not_pretend_the_socket_is_connected() {
        assert_eq!(
            transition(
                RoutingState::SignedIn,
                SessionState::Disconnected,
                RoutingEvent::RoutingFetchFailed,
            ),
            (RoutingState::RoutingError, SessionState::Disconnected)
        );
    }

    #[test]
    fn runtime_error_codes_map_to_reconnect_decisions() {
        assert_eq!(
            reconnect_decision(ReconnectCause::RuntimeError(RuntimeErrorCode::AuthFailed)),
            ReconnectDecision::RefreshRouting
        );
        assert_eq!(
            reconnect_decision(ReconnectCause::RuntimeError(
                RuntimeErrorCode::ServiceUnavailable,
            )),
            ReconnectDecision::RetrySameBadge
        );
        assert_eq!(
            reconnect_decision(ReconnectCause::RuntimeError(
                RuntimeErrorCode::ProtocolUnsupported,
            )),
            ReconnectDecision::Stop
        );
        assert_eq!(
            reconnect_decision(ReconnectCause::RuntimeError(
                RuntimeErrorCode::InvalidConnect
            )),
            ReconnectDecision::Stop
        );
        assert_eq!(
            reconnect_decision(ReconnectCause::TransportDropped),
            ReconnectDecision::RetrySameBadge
        );
    }

    #[test]
    fn backoff_is_exponential_and_capped() {
        assert_eq!(backoff_delay(0), Duration::from_secs(1));
        assert_eq!(backoff_delay(1), Duration::from_secs(2));
        assert_eq!(backoff_delay(2), Duration::from_secs(4));
        assert_eq!(backoff_delay(5), Duration::from_secs(30));
        assert_eq!(backoff_delay(20), Duration::from_secs(30));
    }
}
