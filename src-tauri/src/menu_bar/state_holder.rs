//! Thread-safe wrapper around the `CaptureStateMachine` plus the `AuthChecker`
//! it was constructed from. Managed by Tauri via `app.manage(...)` so the four
//! `#[tauri::command]` handlers can access it.

use std::sync::{Arc, Mutex};

use crate::capture_state::{
    AuthChecker, CaptureState, CaptureStateMachine, ErrorReason, TransitionError,
};

pub struct StateHolder {
    inner: Mutex<CaptureStateMachine>,
    #[allow(dead_code)] // retained for future re-checks once real auth lands
    auth: Arc<dyn AuthChecker>,
}

impl StateHolder {
    pub fn new(auth: Arc<dyn AuthChecker>) -> Self {
        let machine = CaptureStateMachine::from_auth(auth.as_ref());
        Self {
            inner: Mutex::new(machine),
            auth,
        }
    }

    pub fn snapshot(&self) -> CaptureState {
        self.inner
            .lock()
            .expect("capture state mutex poisoned")
            .state()
            .clone()
    }

    pub fn toggle(&self) -> Result<CaptureState, TransitionError> {
        let mut guard = self.inner.lock().expect("capture state mutex poisoned");
        guard.toggle().cloned()
    }

    pub fn to_error(&self, reason: ErrorReason) -> CaptureState {
        let mut guard = self.inner.lock().expect("capture state mutex poisoned");
        guard.to_error(reason).clone()
    }

    pub fn recover_to_stopped(&self) -> CaptureState {
        let mut guard = self.inner.lock().expect("capture state mutex poisoned");
        guard.recover_to_stopped().clone()
    }

    pub fn mark_signed_in(&self) -> CaptureState {
        let mut guard = self.inner.lock().expect("capture state mutex poisoned");
        guard.mark_signed_in().clone()
    }
}
