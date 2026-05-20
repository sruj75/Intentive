//! Pure state→tray-icon-path mapping. Paths are relative to the bundled
//! resources directory (`src-tauri/icons/tray/`). Asset compositing happens
//! offline; runtime just picks the right pre-rendered PNG.

use crate::capture_state::CaptureState;

const IDLE: &str = "icons/tray/status-item-idle.png";
const CAPTURING: &str = "icons/tray/status-item-capturing.png";
const ERROR: &str = "icons/tray/status-item-error.png";

pub fn path_for(state: &CaptureState) -> &'static str {
    match state {
        CaptureState::Unauthenticated | CaptureState::Stopped => IDLE,
        CaptureState::Capturing => CAPTURING,
        CaptureState::Error(_) => ERROR,
    }
}
