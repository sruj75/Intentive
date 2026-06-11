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
    use std::ptr;

    type CFTypeRef = *const c_void;
    type CFArrayRef = *const c_void;
    type CFDictionaryRef = *const c_void;
    type CFNumberRef = *const c_void;
    type CFStringRef = *const c_void;
    type CFIndex = isize;
    type CFTypeId = usize;
    type CGWindowId = u32;
    type CGWindowListOption = u32;

    const K_CG_NULL_WINDOW_ID: CGWindowId = 0;
    const K_CG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY: CGWindowListOption = 1 << 0;
    const K_CG_WINDOW_LIST_EXCLUDE_DESKTOP_ELEMENTS: CGWindowListOption = 1 << 4;
    const K_CF_NUMBER_SINT32_TYPE: CFIndex = 3;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGPreflightScreenCaptureAccess() -> bool;
        fn CGWindowListCopyWindowInfo(
            option: CGWindowListOption,
            relative_to_window: CGWindowId,
        ) -> CFArrayRef;

        static kCGWindowName: CFStringRef;
        static kCGWindowOwnerPID: CFStringRef;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFArrayGetCount(the_array: CFArrayRef) -> CFIndex;
        fn CFArrayGetValueAtIndex(the_array: CFArrayRef, idx: CFIndex) -> CFTypeRef;
        fn CFDictionaryGetValueIfPresent(
            the_dict: CFDictionaryRef,
            key: CFTypeRef,
            value: *mut CFTypeRef,
        ) -> bool;
        fn CFGetTypeID(cf: CFTypeRef) -> CFTypeId;
        fn CFNumberGetTypeID() -> CFTypeId;
        fn CFNumberGetValue(number: CFNumberRef, the_type: CFIndex, value_ptr: *mut c_void)
            -> bool;
        fn CFRelease(cf: CFTypeRef);
        fn CFStringGetTypeID() -> CFTypeId;
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
        // Unlike ScreenPipe's Sequoia-gated CGWindowListCreateImage fallback,
        // this fallback only accepts readable foreign window names and excludes
        // the current process, avoiding the own-window false positive class.
        (unsafe { CGPreflightScreenCaptureAccess() }) || screen_recording_granted_via_window_list()
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

    fn screen_recording_granted_via_window_list() -> bool {
        let options =
            K_CG_WINDOW_LIST_OPTION_ON_SCREEN_ONLY | K_CG_WINDOW_LIST_EXCLUDE_DESKTOP_ELEMENTS;
        let window_list = unsafe { CGWindowListCopyWindowInfo(options, K_CG_NULL_WINDOW_ID) };
        if window_list.is_null() {
            return false;
        }

        let granted = unsafe { readable_foreign_window_name_exists(window_list) };
        unsafe { CFRelease(window_list) };
        granted
    }

    unsafe fn readable_foreign_window_name_exists(window_list: CFArrayRef) -> bool {
        let current_pid = std::process::id() as i32;
        let count = CFArrayGetCount(window_list);
        for index in 0..count {
            let window = CFArrayGetValueAtIndex(window_list, index) as CFDictionaryRef;
            if window.is_null() || window_owner_pid(window) == Some(current_pid) {
                continue;
            }
            if window_has_readable_name(window) {
                return true;
            }
        }
        false
    }

    unsafe fn window_owner_pid(window: CFDictionaryRef) -> Option<i32> {
        let mut value: CFTypeRef = ptr::null();
        if !CFDictionaryGetValueIfPresent(window, kCGWindowOwnerPID, &mut value)
            || value.is_null()
            || CFGetTypeID(value) != CFNumberGetTypeID()
        {
            return None;
        }

        let mut pid = 0_i32;
        if CFNumberGetValue(
            value as CFNumberRef,
            K_CF_NUMBER_SINT32_TYPE,
            (&mut pid as *mut i32).cast::<c_void>(),
        ) {
            Some(pid)
        } else {
            None
        }
    }

    unsafe fn window_has_readable_name(window: CFDictionaryRef) -> bool {
        let mut value: CFTypeRef = ptr::null();
        CFDictionaryGetValueIfPresent(window, kCGWindowName, &mut value)
            && !value.is_null()
            && CFGetTypeID(value) == CFStringGetTypeID()
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
