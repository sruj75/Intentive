//! Capture state machine — pure FSM for the shell states. No Tauri
//! dependencies and no macOS permission APIs.
//!
//! See ADR-0009 for auto-start-after-auth semantics and CONTEXT.md for the
//! Capture Session definition. The state shapes themselves live in
//! `crate::domains::capture::types::state`.

use std::sync::atomic::{AtomicBool, Ordering};

use crate::domains::capture::types::session::CoordinatorCommand;
use crate::domains::capture::types::state::{CaptureState, ErrorReason};
use crate::domains::snapshots::types::SessionEndReason;

pub trait AuthChecker: Send + Sync {
    fn is_signed_in(&self) -> bool;
}

pub trait ReadinessChecker: Send + Sync {
    fn is_capture_ready(&self) -> bool;
}

pub struct StubAuthChecker {
    signed_in: AtomicBool,
}

impl StubAuthChecker {
    pub fn new(initial: bool) -> Self {
        Self {
            signed_in: AtomicBool::new(initial),
        }
    }

    pub fn set_signed_in(&self, value: bool) {
        self.signed_in.store(value, Ordering::SeqCst);
    }
}

impl AuthChecker for StubAuthChecker {
    fn is_signed_in(&self) -> bool {
        self.signed_in.load(Ordering::SeqCst)
    }
}

pub struct StubReadinessChecker {
    ready: AtomicBool,
}

impl StubReadinessChecker {
    pub fn new(initial: bool) -> Self {
        Self {
            ready: AtomicBool::new(initial),
        }
    }

    pub fn set_ready(&self, value: bool) {
        self.ready.store(value, Ordering::SeqCst);
    }
}

impl ReadinessChecker for StubReadinessChecker {
    fn is_capture_ready(&self) -> bool {
        self.ready.load(Ordering::SeqCst)
    }
}

/// The thing the FSM reacts to: a domain command from a producer, or a
/// supervisor lifecycle event translated at the coordinator boundary.
///
/// The supervisor variants are flattened here rather than wrapping the
/// `runtime`-layer `SupervisorEvent` directly: the `service` layer may only
/// depend forward, so the coordinator (in `runtime`) translates the event into
/// this `service`-owned shape before calling [`decide`].
pub enum CaptureInput {
    /// A command published through the coordinator's `submit` surface.
    Command(CoordinatorCommand),
    /// The supervisor reported the child stopped cleanly.
    SupervisorStopped,
    /// The supervisor reported the child crashed; carries the verbatim
    /// user-facing copy for the Capture Error item.
    SupervisorCrashed { user_facing_copy: String },
}

/// The side effect a transition asks the coordinator to perform after it has
/// written the new state and notified observers. Pure data — the coordinator
/// owns the async dispatch.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Effect {
    /// Notify only. Covers the Error→SetupRequired readiness recovery,
    /// `SimulateError`, and the readiness-blocked toggle.
    None,
    /// `supervisor.start()` + `heartbeat.on_session_start()`.
    StartSession,
    /// A coordinator-initiated stop: `supervisor.stop()` +
    /// `heartbeat.on_session_end(reason)` (user toggle, readiness revocation).
    StopSession(SessionEndReason),
    /// ScreenPipe is already gone (supervisor reported Stopped/Crashed), so end
    /// the heartbeat — `heartbeat.on_session_end(reason)` — without re-issuing
    /// `supervisor.stop()`.
    EndSession(SessionEndReason),
}

/// The result of a non-ignored input: the next shell state and the effect to
/// dispatch.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Transition {
    pub next: CaptureState,
    pub effect: Effect,
}

/// The whole Capture Session lifecycle table in one pure place (mirrors
/// `routing::service::transition`). `ready` is `is_capture_ready()` sampled at
/// decide time and consulted for `Toggle`/`SignInCompleted`; `ReadinessChanged`
/// carries its own authoritative bool. Returns `None` when the input is ignored
/// (non-toggleable state, no-op readiness change, late supervisor event while
/// not Capturing).
pub fn decide(state: &CaptureState, input: &CaptureInput, ready: bool) -> Option<Transition> {
    match input {
        CaptureInput::Command(command) => decide_command(state, command, ready),
        CaptureInput::SupervisorStopped => match state {
            // The supervisor reports Stopped both for a real child exit while
            // Capturing and after the readiness-revocation stop() that already
            // moved the shell to SetupRequired. Only honor a Capturing settle;
            // otherwise it would clobber SetupRequired or Error.
            CaptureState::Capturing => Some(Transition {
                next: CaptureState::Stopped,
                effect: Effect::EndSession(SessionEndReason::Quit),
            }),
            _ => None,
        },
        CaptureInput::SupervisorCrashed { user_facing_copy } => match state {
            CaptureState::Capturing => {
                let reason = ErrorReason::new(user_facing_copy.clone())
                    .expect("supervisor crash copy is non-empty");
                Some(Transition {
                    next: CaptureState::Error(reason),
                    effect: Effect::EndSession(SessionEndReason::Crash),
                })
            }
            _ => None,
        },
    }
}

fn decide_command(
    state: &CaptureState,
    command: &CoordinatorCommand,
    ready: bool,
) -> Option<Transition> {
    match command {
        CoordinatorCommand::ToggleRequested => match state {
            CaptureState::Capturing => Some(Transition {
                next: CaptureState::Stopped,
                effect: Effect::StopSession(SessionEndReason::UserToggle),
            }),
            CaptureState::Stopped if ready => Some(Transition {
                next: CaptureState::Capturing,
                effect: Effect::StartSession,
            }),
            // Stale Stopped under a now-revoked grant: surface the block, but
            // never start capture.
            CaptureState::Stopped => Some(Transition {
                next: CaptureState::SetupRequired,
                effect: Effect::None,
            }),
            CaptureState::Unauthenticated
            | CaptureState::SetupRequired
            | CaptureState::Error(_) => None,
        },
        // Completing sign-in (ADR-0009) starts a Capture Session only when the
        // local permission interlock is already satisfied; otherwise it parks
        // in SetupRequired.
        CoordinatorCommand::SignInCompleted => {
            if ready {
                Some(Transition {
                    next: CaptureState::Capturing,
                    effect: Effect::StartSession,
                })
            } else {
                Some(Transition {
                    next: CaptureState::SetupRequired,
                    effect: Effect::None,
                })
            }
        }
        CoordinatorCommand::ReadinessChanged(now_ready) => match (state, *now_ready) {
            (CaptureState::SetupRequired, true) => Some(Transition {
                next: CaptureState::Capturing,
                effect: Effect::StartSession,
            }),
            (CaptureState::Capturing, false) => Some(Transition {
                next: CaptureState::SetupRequired,
                effect: Effect::StopSession(SessionEndReason::Quit),
            }),
            // A crash is classified as Error first; the monitor poll is the
            // single authority for permission state. Once it observes a grant
            // is actually gone, reclassify Error to the SetupRequired recovery
            // flow. ScreenPipe is already dead and the heartbeat already ended
            // at crash time, so this arm does no stop / heartbeat work.
            (CaptureState::Error(_), false) => Some(Transition {
                next: CaptureState::SetupRequired,
                effect: Effect::None,
            }),
            _ => None,
        },
        CoordinatorCommand::SimulateError(reason) => Some(Transition {
            next: CaptureState::Error(reason.clone()),
            effect: Effect::None,
        }),
    }
}

/// A thin holder of the current shell state plus the startup-state derivation.
/// Every transition decision now lives in [`decide`]; the machine only owns
/// where capture *begins* and the authoritative `state` cell.
pub struct CaptureStateMachine {
    state: CaptureState,
}

impl CaptureStateMachine {
    pub fn from_initial(is_signed_in: bool, is_capture_ready: bool) -> Self {
        let state = match (is_signed_in, is_capture_ready) {
            (false, _) => CaptureState::Unauthenticated,
            (true, false) => CaptureState::SetupRequired,
            (true, true) => CaptureState::Capturing,
        };
        Self { state }
    }

    pub fn from_checks(auth: &dyn AuthChecker, readiness: &dyn ReadinessChecker) -> Self {
        Self::from_initial(auth.is_signed_in(), readiness.is_capture_ready())
    }

    pub fn state(&self) -> &CaptureState {
        &self.state
    }

    /// Apply a state computed by [`decide`].
    pub fn set(&mut self, next: CaptureState) {
        self.state = next;
    }
}

#[cfg(test)]
mod tests;
