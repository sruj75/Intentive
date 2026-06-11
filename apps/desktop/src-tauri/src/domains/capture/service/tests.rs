use super::*;

#[test]
fn from_initial_with_no_auth_yields_unauthenticated() {
    let machine = CaptureStateMachine::from_initial(false, true);
    assert_eq!(machine.state(), &CaptureState::Unauthenticated);
}

#[test]
fn from_initial_with_auth_and_readiness_yields_capturing() {
    let machine = CaptureStateMachine::from_initial(true, true);
    assert_eq!(machine.state(), &CaptureState::Capturing);
}

#[test]
fn from_initial_with_auth_but_no_readiness_yields_setup_required() {
    let machine = CaptureStateMachine::from_initial(true, false);
    assert_eq!(machine.state(), &CaptureState::SetupRequired);
}

#[test]
fn toggle_capturing_becomes_stopped() {
    let mut machine = CaptureStateMachine::from_initial(true, true);
    let next = machine.toggle();
    assert_eq!(next, Ok(&CaptureState::Stopped));
}

#[test]
fn toggle_stopped_becomes_capturing() {
    let mut machine = CaptureStateMachine::from_initial(true, true);
    machine.toggle().expect("Capturing toggle is valid");
    let next = machine.toggle();
    assert_eq!(next, Ok(&CaptureState::Capturing));
}

#[test]
fn toggle_in_unauthenticated_returns_not_toggleable() {
    let mut machine = CaptureStateMachine::from_initial(false, true);
    let result = machine.toggle();
    assert_eq!(result, Err(TransitionError::NotToggleable));
    assert_eq!(machine.state(), &CaptureState::Unauthenticated);
}

#[test]
fn toggle_in_setup_required_returns_not_toggleable() {
    let mut machine = CaptureStateMachine::from_initial(true, false);
    let result = machine.toggle();
    assert_eq!(result, Err(TransitionError::NotToggleable));
    assert_eq!(machine.state(), &CaptureState::SetupRequired);
}

#[test]
fn toggle_in_error_returns_not_toggleable() {
    let mut machine = CaptureStateMachine::from_initial(true, true);
    machine.to_error(ErrorReason::new("screenpipe crashed".to_string()).unwrap());
    let result = machine.toggle();
    assert_eq!(result, Err(TransitionError::NotToggleable));
}

#[test]
fn to_error_from_any_state_transitions_to_error_with_reason() {
    let reason_text = "screenpipe exited";
    let reason = ErrorReason::new(reason_text.to_string()).unwrap();

    let mut from_unauth = CaptureStateMachine::from_initial(false, true);
    from_unauth.to_error(reason.clone());
    assert_eq!(
        from_unauth.state(),
        &CaptureState::Error(reason.clone()),
        "Unauthenticated -> Error",
    );

    let mut from_capturing = CaptureStateMachine::from_initial(true, true);
    from_capturing.to_error(reason.clone());
    assert_eq!(
        from_capturing.state(),
        &CaptureState::Error(reason.clone()),
        "Capturing -> Error",
    );

    let mut from_stopped = CaptureStateMachine::from_initial(true, true);
    from_stopped.toggle().expect("Capturing toggles to Stopped");
    from_stopped.to_error(reason.clone());
    assert_eq!(
        from_stopped.state(),
        &CaptureState::Error(reason.clone()),
        "Stopped -> Error",
    );

    let mut from_error = CaptureStateMachine::from_initial(true, true);
    from_error.to_error(ErrorReason::new("first".to_string()).unwrap());
    from_error.to_error(reason.clone());
    assert_eq!(
        from_error.state(),
        &CaptureState::Error(reason.clone()),
        "Error -> Error (replaces reason)",
    );
    if let CaptureState::Error(r) = from_error.state() {
        assert_eq!(r.as_str(), reason_text);
    }
}

#[test]
fn error_reason_rejects_empty() {
    assert!(ErrorReason::new("".to_string()).is_err());
    assert!(ErrorReason::new("   ".to_string()).is_err());
}

#[test]
fn recover_to_stopped_from_error_yields_stopped() {
    let mut machine = CaptureStateMachine::from_initial(true, true);
    machine.to_error(ErrorReason::new("oops".to_string()).unwrap());
    let next = machine.recover_to_stopped();
    assert_eq!(next, &CaptureState::Stopped);
}

#[test]
fn mark_signed_in_from_unauthenticated_yields_capturing_when_ready() {
    let mut machine = CaptureStateMachine::from_initial(false, true);
    let next = machine.mark_signed_in(true);
    assert_eq!(next, &CaptureState::Capturing);
}

#[test]
fn mark_signed_in_from_unauthenticated_yields_setup_required_when_not_ready() {
    let mut machine = CaptureStateMachine::from_initial(false, true);
    let next = machine.mark_signed_in(false);
    assert_eq!(next, &CaptureState::SetupRequired);
}

#[test]
fn mark_ready_from_setup_required_yields_capturing() {
    let mut machine = CaptureStateMachine::from_initial(true, false);
    let next = machine.mark_ready();
    assert_eq!(next, &CaptureState::Capturing);
}

#[test]
fn to_setup_required_from_capturing_yields_setup_required() {
    let mut machine = CaptureStateMachine::from_initial(true, true);
    let next = machine.to_setup_required();
    assert_eq!(next, &CaptureState::SetupRequired);
}

#[test]
fn from_checks_uses_checker_ready_path() {
    let checker = StubAuthChecker::new(true);
    let readiness = StubReadinessChecker::new(true);
    let machine = CaptureStateMachine::from_checks(&checker, &readiness);
    assert_eq!(machine.state(), &CaptureState::Capturing);
}

#[test]
fn from_checks_uses_auth_false_path() {
    let checker = StubAuthChecker::new(false);
    let readiness = StubReadinessChecker::new(true);
    let machine = CaptureStateMachine::from_checks(&checker, &readiness);
    assert_eq!(machine.state(), &CaptureState::Unauthenticated);
}

#[test]
fn from_checks_uses_readiness_false_path() {
    let checker = StubAuthChecker::new(true);
    let readiness = StubReadinessChecker::new(false);
    let machine = CaptureStateMachine::from_checks(&checker, &readiness);
    assert_eq!(machine.state(), &CaptureState::SetupRequired);
}

#[test]
fn stub_auth_checker_reflects_set_signed_in() {
    let checker = StubAuthChecker::new(false);
    assert!(!checker.is_signed_in());
    checker.set_signed_in(true);
    assert!(checker.is_signed_in());
    checker.set_signed_in(false);
    assert!(!checker.is_signed_in());
}

#[test]
fn stub_readiness_checker_reflects_set_ready() {
    let checker = StubReadinessChecker::new(false);
    assert!(!checker.is_capture_ready());
    checker.set_ready(true);
    assert!(checker.is_capture_ready());
    checker.set_ready(false);
    assert!(!checker.is_capture_ready());
}
