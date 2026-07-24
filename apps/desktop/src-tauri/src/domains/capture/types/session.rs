//! Coordinator vocabulary: the domain commands producers submit and the
//! observer the menubar registers to re-render on every state change.

use std::sync::Arc;

use async_trait::async_trait;

use super::state::{CaptureState, ErrorReason};
use crate::domains::snapshots::types::SessionEndReason;

/// Domain commands the coordinator consumes. Producers (menu bar, future auth
/// adapter, debug shims) publish these via `submit`; the coordinator decides
/// the effect.
#[derive(Debug, Clone)]
pub enum CoordinatorCommand {
    /// User clicked the menu bar toggle.
    ToggleRequested,
    /// Sign-in (and consent) just completed. Auto-starts a Capture Session per
    /// ADR-0009.
    SignInCompleted,
    /// Desktop Capture Readiness changed. The coordinator maps this single
    /// boolean into Capture Session lifecycle changes; permission-specific
    /// details stay behind the provider seam.
    ReadinessChanged(bool),
    /// Debug-only: drive the FSM straight to Capture Error. Replaces the
    /// previous `simulate_error` Tauri command path.
    SimulateError(ErrorReason),
}

/// Receivers of state-change notifications. The menu bar registers exactly one
/// observer at install time to re-render the tray; tests use a recording
/// observer.
pub trait StateObserver: Send + Sync {
    fn on_state(&self, state: &CaptureState);
}

/// Control surface the menubar (and other producers) hold to drive a Capture
/// Session without depending on the concrete coordinator in the `runtime`
/// layer. The coordinator implements this; `lib.rs` injects it. Keeping the
/// seam in `types` lets cross-domain callers depend on the contract, not the
/// implementation.
pub trait CaptureSessionControl: Send + Sync {
    fn submit(&self, command: CoordinatorCommand);
    fn subscribe(&self, observer: Arc<dyn StateObserver>);
    fn snapshot(&self) -> CaptureState;
}

/// Session lifecycle hooks the coordinator fires when a Capture Session starts
/// and ends. The Context Heartbeat (snapshots domain) is the production
/// implementation, injected at the `lib.rs` composition root — the coordinator
/// depends on this seam, not on the heartbeat directly. `SessionEndReason` is a
/// shared data contract from the snapshots domain's `types` layer.
#[async_trait]
pub trait SessionHooks: Send + Sync {
    async fn on_session_start(&self);
    async fn on_session_end(&self, reason: SessionEndReason);
}
