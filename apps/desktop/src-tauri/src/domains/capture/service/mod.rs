//! Capture state machine — pure FSM for the shell states. No Tauri
//! dependencies and no macOS permission APIs.
//!
//! See ADR-0009 for auto-start-after-auth semantics and CONTEXT.md for the
//! Capture Session definition. The state shapes themselves live in
//! `crate::domains::capture::types::state`.

use std::sync::atomic::{AtomicBool, Ordering};

use crate::domains::capture::types::state::{CaptureState, ErrorReason};

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

#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum TransitionError {
    #[error("current state is not toggleable")]
    NotToggleable,
}

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

    pub fn toggle(&mut self) -> Result<&CaptureState, TransitionError> {
        let next = match self.state {
            CaptureState::Capturing => CaptureState::Stopped,
            CaptureState::Stopped => CaptureState::Capturing,
            CaptureState::Unauthenticated
            | CaptureState::SetupRequired
            | CaptureState::Error(_) => {
                return Err(TransitionError::NotToggleable);
            }
        };
        self.state = next;
        Ok(&self.state)
    }

    pub fn to_error(&mut self, reason: ErrorReason) -> &CaptureState {
        self.set(CaptureState::Error(reason))
    }

    pub fn recover_to_stopped(&mut self) -> &CaptureState {
        self.set(CaptureState::Stopped)
    }

    pub fn mark_signed_in(&mut self, is_capture_ready: bool) -> &CaptureState {
        if is_capture_ready {
            self.set(CaptureState::Capturing)
        } else {
            self.set(CaptureState::SetupRequired)
        }
    }

    pub fn mark_ready(&mut self) -> &CaptureState {
        if matches!(self.state, CaptureState::SetupRequired) {
            self.set(CaptureState::Capturing)
        } else {
            &self.state
        }
    }

    pub fn to_setup_required(&mut self) -> &CaptureState {
        self.set(CaptureState::SetupRequired)
    }

    fn set(&mut self, new: CaptureState) -> &CaptureState {
        self.state = new;
        &self.state
    }
}

#[cfg(test)]
mod tests;
