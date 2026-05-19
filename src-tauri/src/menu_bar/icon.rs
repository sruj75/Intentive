//! Pure state→tray-icon-path mapping. Paths are relative to the bundled
//! resources directory (`src-tauri/icons/tray/`). Asset compositing happens
//! offline; runtime just picks the right pre-rendered PNG.

use crate::capture_state::CaptureState;

const IDLE: &str = "icons/tray/menu-icon-idle.png";
const CAPTURING: &str = "icons/tray/menu-icon-capturing.png";
const ERROR: &str = "icons/tray/menu-icon-error.png";

pub fn path_for(state: &CaptureState) -> &'static str {
    match state {
        CaptureState::Unauthenticated | CaptureState::Stopped => IDLE,
        CaptureState::Capturing => CAPTURING,
        CaptureState::Error(_) => ERROR,
    }
}
