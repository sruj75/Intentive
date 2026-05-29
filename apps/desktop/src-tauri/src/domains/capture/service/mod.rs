//! Capture state machine — pure FSM for the four shell states
//! (Unauthenticated, Stopped, Capturing, Error). No Tauri dependencies.
//!
//! See ADR-0009 for auto-start-after-auth semantics and CONTEXT.md for the
//! Capture Session definition. The state shapes themselves live in
//! `crate::domains::capture::types::state`.

use std::sync::atomic::{AtomicBool, Ordering};

use crate::domains::capture::types::state::{CaptureState, ErrorReason};

pub trait AuthChecker: Send + Sync {
    fn is_signed_in(&self) -> bool;
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

#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum TransitionError {
    #[error("current state is not toggleable")]
    NotToggleable,
}

pub struct CaptureStateMachine {
    state: CaptureState,
}

impl CaptureStateMachine {
    pub fn from_initial(is_signed_in: bool) -> Self {
        let state = if is_signed_in {
            CaptureState::Capturing
        } else {
            CaptureState::Unauthenticated
        };
        Self { state }
    }

    pub fn from_auth(checker: &dyn AuthChecker) -> Self {
        Self::from_initial(checker.is_signed_in())
    }

    pub fn state(&self) -> &CaptureState {
        &self.state
    }

    pub fn toggle(&mut self) -> Result<&CaptureState, TransitionError> {
        let next = match self.state {
            CaptureState::Capturing => CaptureState::Stopped,
            CaptureState::Stopped => CaptureState::Capturing,
            CaptureState::Unauthenticated | CaptureState::Error(_) => {
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

    pub fn mark_signed_in(&mut self) -> &CaptureState {
        self.set(CaptureState::Capturing)
    }

    fn set(&mut self, new: CaptureState) -> &CaptureState {
        self.state = new;
        &self.state
    }
}

#[cfg(test)]
mod tests;
