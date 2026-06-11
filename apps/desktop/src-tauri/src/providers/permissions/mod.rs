//! Desktop Capture Readiness provider.
//!
//! The rest of the app needs one judgement: can capture run right now? This
//! module owns the macOS-specific permission probes and exposes them as a small
//! value-object API so CoreGraphics, Accessibility, and AVFoundation details do
//! not leak into capture orchestration.

use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};

use crate::domains::capture::service::ReadinessChecker;

pub mod commands;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PermissionSet {
    pub screen_recording: bool,
    pub microphone: bool,
    pub accessibility: bool,
}

impl PermissionSet {
    pub fn all_granted(&self) -> bool {
        self.screen_recording && self.microphone && self.accessibility
    }
}

pub trait CapturePermissions: Send + Sync + 'static {
    fn snapshot(&self) -> PermissionSet;

    fn is_capture_ready(&self) -> bool {
        self.snapshot().all_granted()
    }
}

impl<T> ReadinessChecker for T
where
    T: CapturePermissions,
{
    fn is_capture_ready(&self) -> bool {
        CapturePermissions::is_capture_ready(self)
    }
}

pub struct StubCapturePermissions {
    screen_recording: AtomicBool,
    microphone: AtomicBool,
    accessibility: AtomicBool,
}

impl StubCapturePermissions {
    pub fn new(snapshot: PermissionSet) -> Self {
        Self {
            screen_recording: AtomicBool::new(snapshot.screen_recording),
            microphone: AtomicBool::new(snapshot.microphone),
            accessibility: AtomicBool::new(snapshot.accessibility),
        }
    }

    pub fn set_snapshot(&self, snapshot: PermissionSet) {
        self.screen_recording
            .store(snapshot.screen_recording, Ordering::SeqCst);
        self.microphone.store(snapshot.microphone, Ordering::SeqCst);
        self.accessibility
            .store(snapshot.accessibility, Ordering::SeqCst);
    }
}

impl CapturePermissions for StubCapturePermissions {
    fn snapshot(&self) -> PermissionSet {
        PermissionSet {
            screen_recording: self.screen_recording.load(Ordering::SeqCst),
            microphone: self.microphone.load(Ordering::SeqCst),
            accessibility: self.accessibility.load(Ordering::SeqCst),
        }
    }
}

#[derive(Default)]
pub struct MacosCapturePermissions;

impl CapturePermissions for MacosCapturePermissions {
    fn snapshot(&self) -> PermissionSet {
        platform_snapshot()
    }
}

#[cfg(target_os = "macos")]
fn platform_snapshot() -> PermissionSet {
    PermissionSet {
        screen_recording: macos::screen_recording_granted(),
        microphone: macos::microphone_granted(),
        accessibility: macos::accessibility_granted(),
    }
}

#[cfg(not(target_os = "macos"))]
fn platform_snapshot() -> PermissionSet {
    PermissionSet {
        screen_recording: false,
        microphone: false,
        accessibility: false,
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use std::ffi::{c_char, c_void};

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGPreflightScreenCaptureAccess() -> bool;
    }

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
    }

    #[link(name = "AVFoundation", kind = "framework")]
    extern "C" {
        static AVMediaTypeAudio: *mut c_void;
    }

    #[link(name = "objc", kind = "dylib")]
    extern "C" {
        fn objc_getClass(name: *const c_char) -> *mut c_void;
        fn sel_registerName(name: *const c_char) -> *mut c_void;
        fn objc_msgSend();
    }

    pub fn screen_recording_granted() -> bool {
        unsafe { CGPreflightScreenCaptureAccess() }
    }

    pub fn accessibility_granted() -> bool {
        unsafe { AXIsProcessTrusted() }
    }

    pub fn microphone_granted() -> bool {
        const AV_AUTHORIZED: i64 = 3;
        type AuthorizationStatusForMediaType =
            unsafe extern "C" fn(*mut c_void, *mut c_void, *mut c_void) -> i64;
        let class = unsafe { objc_getClass(c"AVCaptureDevice".as_ptr()) };
        let selector = unsafe { sel_registerName(c"authorizationStatusForMediaType:".as_ptr()) };
        let send: AuthorizationStatusForMediaType =
            unsafe { std::mem::transmute(objc_msgSend as *const ()) };
        let status = unsafe { send(class, selector, AVMediaTypeAudio) };
        status == AV_AUTHORIZED
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permission_set_reports_all_granted_only_when_every_grant_is_true() {
        assert!(PermissionSet {
            screen_recording: true,
            microphone: true,
            accessibility: true,
        }
        .all_granted());

        assert!(!PermissionSet {
            screen_recording: true,
            microphone: false,
            accessibility: true,
        }
        .all_granted());
    }

    #[test]
    fn stub_capture_permissions_reports_live_snapshot_and_readiness() {
        let permissions = StubCapturePermissions::new(PermissionSet {
            screen_recording: true,
            microphone: false,
            accessibility: true,
        });
        assert_eq!(
            permissions.snapshot(),
            PermissionSet {
                screen_recording: true,
                microphone: false,
                accessibility: true,
            }
        );
        assert!(!CapturePermissions::is_capture_ready(&permissions));

        permissions.set_snapshot(PermissionSet {
            screen_recording: true,
            microphone: true,
            accessibility: true,
        });
        assert!(CapturePermissions::is_capture_ready(&permissions));
    }
}
