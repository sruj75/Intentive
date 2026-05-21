use std::sync::Arc;

use super::icon::path_for;
use super::menu::{describe, MenuItemDescriptor, START_CAPTURING_LABEL, STOP_CAPTURING_LABEL};
use super::state_holder::StateHolder;
use crate::capture_state::{AuthChecker, CaptureState, ErrorReason, StubAuthChecker};

#[test]
fn menu_for_unauthenticated_has_clickable_sign_in_and_disabled_rest() {
    let descriptor = describe(&CaptureState::Unauthenticated);
    let items = descriptor.items();

    assert_eq!(items.len(), 3);
    assert!(matches!(
        items[0],
        MenuItemDescriptor::SignIn { enabled: true }
    ));
    assert!(matches!(
        items[1],
        MenuItemDescriptor::Settings { enabled: false }
    ));
    assert!(matches!(
        items[2],
        MenuItemDescriptor::Quit { enabled: false }
    ));
}

#[test]
fn menu_for_stopped_shows_start_capturing_toggle() {
    let descriptor = describe(&CaptureState::Stopped);
    let items = descriptor.items();

    assert_eq!(items.len(), 3);
    match &items[0] {
        MenuItemDescriptor::Toggle { label, enabled } => {
            assert_eq!(*label, START_CAPTURING_LABEL);
            assert!(*enabled);
        }
        other => panic!("expected Toggle, got {:?}", other),
    }
    assert!(matches!(
        items[1],
        MenuItemDescriptor::Settings { enabled: true }
    ));
    assert!(matches!(
        items[2],
        MenuItemDescriptor::Quit { enabled: true }
    ));
}

#[test]
fn menu_for_capturing_shows_stop_capturing_toggle() {
    let descriptor = describe(&CaptureState::Capturing);
    let items = descriptor.items();

    assert_eq!(items.len(), 3);
    match &items[0] {
        MenuItemDescriptor::Toggle { label, enabled } => {
            assert_eq!(*label, STOP_CAPTURING_LABEL);
            assert!(*enabled);
        }
        other => panic!("expected Toggle, got {:?}", other),
    }
    assert!(matches!(
        items[1],
        MenuItemDescriptor::Settings { enabled: true }
    ));
    assert!(matches!(
        items[2],
        MenuItemDescriptor::Quit { enabled: true }
    ));
}

#[test]
fn menu_for_error_shows_disabled_info_text_and_no_toggle() {
    let reason = ErrorReason::new("ScreenPipe exited unexpectedly".to_string()).unwrap();
    let descriptor = describe(&CaptureState::Error(reason));
    let items = descriptor.items();

    assert_eq!(items.len(), 3);
    match &items[0] {
        MenuItemDescriptor::ErrorInfo { text, enabled } => {
            assert_eq!(text, "ScreenPipe exited unexpectedly");
            assert!(!*enabled);
        }
        other => panic!("expected ErrorInfo, got {:?}", other),
    }
    assert!(matches!(
        items[1],
        MenuItemDescriptor::Settings { enabled: true }
    ));
    assert!(matches!(
        items[2],
        MenuItemDescriptor::Quit { enabled: true }
    ));

    for item in items {
        assert!(
            !matches!(item, MenuItemDescriptor::Toggle { .. }),
            "Error state must not contain a Toggle item"
        );
    }
}

#[test]
fn icon_for_unauthenticated_and_stopped_is_idle() {
    assert!(path_for(&CaptureState::Unauthenticated).ends_with("status-item-idle.png"));
    assert!(path_for(&CaptureState::Stopped).ends_with("status-item-idle.png"));
}

#[test]
fn icon_for_capturing_is_recording_dot() {
    assert!(path_for(&CaptureState::Capturing).ends_with("status-item-capturing.png"));
}

#[test]
fn icon_for_error_is_warning_dot() {
    let reason = ErrorReason::new("anything".to_string()).unwrap();
    assert!(path_for(&CaptureState::Error(reason)).ends_with("status-item-error.png"));
}

#[test]
fn state_holder_returns_initial_state_from_auth_checker_signed_in() {
    let auth = Arc::new(StubAuthChecker::new(true));
    let holder = StateHolder::new(auth);
    assert_eq!(holder.snapshot(), CaptureState::Capturing);
}

#[test]
fn state_holder_returns_initial_state_from_auth_checker_signed_out() {
    let auth = Arc::new(StubAuthChecker::new(false));
    let holder = StateHolder::new(auth);
    assert_eq!(holder.snapshot(), CaptureState::Unauthenticated);
}

#[test]
fn toggle_command_inner_flips_state_and_returns_new_descriptor() {
    let auth = Arc::new(StubAuthChecker::new(true));
    let holder = StateHolder::new(auth);

    let after_stop =
        super::commands::toggle_capture_inner(&holder).expect("toggle from Capturing must succeed");
    assert_eq!(holder.snapshot(), CaptureState::Stopped);
    match &after_stop.items()[0] {
        MenuItemDescriptor::Toggle { label, enabled } => {
            assert_eq!(*label, START_CAPTURING_LABEL);
            assert!(*enabled);
        }
        other => panic!("expected Toggle, got {:?}", other),
    }

    let after_start =
        super::commands::toggle_capture_inner(&holder).expect("toggle from Stopped must succeed");
    assert_eq!(holder.snapshot(), CaptureState::Capturing);
    match &after_start.items()[0] {
        MenuItemDescriptor::Toggle { label, .. } => {
            assert_eq!(*label, STOP_CAPTURING_LABEL);
        }
        other => panic!("expected Toggle, got {:?}", other),
    }
}

#[test]
fn open_sign_in_inner_flips_stub_auth_and_advances_state() {
    let stub = Arc::new(StubAuthChecker::new(false));
    let holder = StateHolder::new(stub.clone());
    assert_eq!(holder.snapshot(), CaptureState::Unauthenticated);
    assert!(!stub.is_signed_in());

    let descriptor = super::commands::open_sign_in_surface_inner(&holder, &stub);

    assert!(stub.is_signed_in());
    assert_eq!(holder.snapshot(), CaptureState::Capturing);
    match &descriptor.items()[0] {
        MenuItemDescriptor::Toggle { label, .. } => {
            assert_eq!(*label, STOP_CAPTURING_LABEL);
        }
        other => panic!("expected Toggle in descriptor, got {:?}", other),
    }
}
