//! The four shell states of a Capture Session and the validated error reason
//! they carry. Pure data — the transition rules live in the `service` layer's
//! `CaptureStateMachine`. See ADR-0009 and CONTEXT.md.

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ErrorReason(String);

#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum ErrorReasonError {
    #[error("error reason must not be empty")]
    Empty,
}

impl ErrorReason {
    pub fn new(reason: String) -> Result<Self, ErrorReasonError> {
        if reason.trim().is_empty() {
            return Err(ErrorReasonError::Empty);
        }
        Ok(Self(reason))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CaptureState {
    Unauthenticated,
    SetupRequired,
    Stopped,
    Capturing,
    Error(ErrorReason),
}
