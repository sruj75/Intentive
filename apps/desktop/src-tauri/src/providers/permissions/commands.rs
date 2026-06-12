use std::process::Command;
use std::sync::Arc;

use serde::Deserialize;
use tauri::Emitter;

use super::{CapturePermissions, PermissionSet, PERMISSIONS_STATUS_EVENT};

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionKind {
    ScreenRecording,
    Microphone,
    Accessibility,
}

#[tauri::command]
pub fn capture_permission_status(
    app: tauri::AppHandle,
    permissions: tauri::State<'_, Arc<dyn CapturePermissions>>,
) -> PermissionSet {
    let snapshot = permissions.inner().snapshot();
    let _ = app.emit(PERMISSIONS_STATUS_EVENT, snapshot);
    snapshot
}

#[tauri::command]
pub fn open_permission_pane(kind: PermissionKind) -> Result<(), String> {
    let primary = match kind {
        PermissionKind::ScreenRecording => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
        }
        PermissionKind::Microphone => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
        }
        PermissionKind::Accessibility => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
        }
    };
    open_url(primary)
        .or_else(|_| open_url("x-apple.systempreferences:com.apple.preference.security"))
}

fn open_url(url: &str) -> Result<(), String> {
    Command::new("open")
        .arg(url)
        .status()
        .map_err(|e| e.to_string())
        .and_then(|status| {
            if status.success() {
                Ok(())
            } else {
                Err(format!("open exited with status {status}"))
            }
        })
}
