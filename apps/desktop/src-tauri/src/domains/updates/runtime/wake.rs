//! macOS wake-from-sleep trigger for the silent updater (ADR-0024).
//!
//! A lid-close *suspends* the process rather than quitting it, so a launch-only
//! check would never fire for users who only sleep/wake. We hook
//! `NSWorkspaceDidWakeNotification` and re-run the (tested) coordinator's
//! update pass each time the Mac wakes. This is the load-bearing detail of
//! ADR-0024 and is only confirmable in the release smoke, not a unit test.
//!
//! The observer is built with the same raw Objective-C runtime FFI the capture
//! permission probes use (`providers/permissions`), avoiding a heavyweight
//! `objc2` dependency. It is a thin shim: the moment a wake fires it spawns
//! `UpdateCoordinator::trigger`, where all the logic and concurrency dedupe
//! live.

use std::ffi::{c_char, c_void};
use std::ptr;
use std::sync::{Arc, OnceLock};

use super::UpdateCoordinator;

/// The single coordinator the wake handler drives. Set once at startup; the
/// Objective-C callback has no other way to carry Rust state.
static WAKE_COORDINATOR: OnceLock<Arc<UpdateCoordinator>> = OnceLock::new();

#[link(name = "objc", kind = "dylib")]
extern "C" {
    fn objc_getClass(name: *const c_char) -> *mut c_void;
    fn objc_allocateClassPair(
        superclass: *mut c_void,
        name: *const c_char,
        extra_bytes: usize,
    ) -> *mut c_void;
    fn objc_registerClassPair(cls: *mut c_void);
    fn class_addMethod(
        cls: *mut c_void,
        name: *mut c_void,
        imp: *const c_void,
        types: *const c_char,
    ) -> bool;
    fn class_createInstance(cls: *mut c_void, extra_bytes: usize) -> *mut c_void;
    fn sel_registerName(name: *const c_char) -> *mut c_void;
    fn objc_msgSend();
}

#[link(name = "AppKit", kind = "framework")]
extern "C" {
    static NSWorkspaceDidWakeNotification: *const c_void;
}

/// `-[IntentiveWakeObserver handleWake:]`. Fires on the main run loop every
/// time macOS wakes from sleep; spawns the coordinator's silent update pass.
extern "C" fn handle_wake(_this: *mut c_void, _cmd: *mut c_void, _notification: *mut c_void) {
    if let Some(coordinator) = WAKE_COORDINATOR.get() {
        let coordinator = coordinator.clone();
        tauri::async_runtime::spawn(async move { coordinator.trigger().await });
    }
}

/// Register the wake observer with `NSWorkspace`'s notification center.
/// Idempotent: only the first call wins (a second would re-allocate a class of
/// the same name and fail). Called once from the `lib.rs` composition root.
pub fn register_wake_trigger(coordinator: Arc<UpdateCoordinator>) {
    if WAKE_COORDINATOR.set(coordinator).is_err() {
        return;
    }

    // `objc_msgSend` is variadic at the C ABI; we transmute it to a concrete
    // signature per call shape, exactly as `providers/permissions` does.
    type MsgSend0 = unsafe extern "C" fn(*mut c_void, *mut c_void) -> *mut c_void;
    type MsgSendAddObserver = unsafe extern "C" fn(
        *mut c_void,
        *mut c_void,
        *mut c_void,
        *mut c_void,
        *const c_void,
        *mut c_void,
    );

    unsafe {
        // Define a minimal NSObject subclass with one method, `handleWake:`.
        let ns_object = objc_getClass(c"NSObject".as_ptr());
        let observer_class =
            objc_allocateClassPair(ns_object, c"IntentiveWakeObserver".as_ptr(), 0);
        let handle_sel = sel_registerName(c"handleWake:".as_ptr());
        // Type encoding: void return, (id self, SEL _cmd, id notification).
        class_addMethod(
            observer_class,
            handle_sel,
            handle_wake as *const c_void,
            c"v@:@".as_ptr(),
        );
        objc_registerClassPair(observer_class);
        let observer = class_createInstance(observer_class, 0);

        // [[NSWorkspace sharedWorkspace] notificationCenter]
        let send0: MsgSend0 = std::mem::transmute(objc_msgSend as *const ());
        let workspace_class = objc_getClass(c"NSWorkspace".as_ptr());
        let workspace = send0(workspace_class, sel_registerName(c"sharedWorkspace".as_ptr()));
        let center = send0(workspace, sel_registerName(c"notificationCenter".as_ptr()));

        // [center addObserver:observer selector:@selector(handleWake:)
        //               name:NSWorkspaceDidWakeNotification object:nil]
        let add_observer: MsgSendAddObserver = std::mem::transmute(objc_msgSend as *const ());
        let add_sel = sel_registerName(c"addObserver:selector:name:object:".as_ptr());
        add_observer(
            center,
            add_sel,
            observer,
            handle_sel,
            NSWorkspaceDidWakeNotification,
            ptr::null_mut(),
        );
    }
}
