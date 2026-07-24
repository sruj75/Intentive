use super::*;

fn err(reason: &str) -> ErrorReason {
    ErrorReason::new(reason.to_string()).expect("non-empty reason")
}

// ---------------------------------------------------------------------------
// Startup-state derivation (`from_initial` / `from_checks`). This is real
// logic — the only setters the machine keeps — so it stays under test.
// ---------------------------------------------------------------------------

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
fn from_checks_uses_checker_ready_path() {
    let machine =
        CaptureStateMachine::from_checks(&StubAuthChecker::new(true), &StubReadinessChecker::new(true));
    assert_eq!(machine.state(), &CaptureState::Capturing);
}

#[test]
fn from_checks_uses_auth_false_path() {
    let machine = CaptureStateMachine::from_checks(
        &StubAuthChecker::new(false),
        &StubReadinessChecker::new(true),
    );
    assert_eq!(machine.state(), &CaptureState::Unauthenticated);
}

#[test]
fn from_checks_uses_readiness_false_path() {
    let machine = CaptureStateMachine::from_checks(
        &StubAuthChecker::new(true),
        &StubReadinessChecker::new(false),
    );
    assert_eq!(machine.state(), &CaptureState::SetupRequired);
}

#[test]
fn error_reason_rejects_empty() {
    assert!(ErrorReason::new("".to_string()).is_err());
    assert!(ErrorReason::new("   ".to_string()).is_err());
}

#[test]
fn stub_checkers_reflect_setters() {
    let auth = StubAuthChecker::new(false);
    assert!(!auth.is_signed_in());
    auth.set_signed_in(true);
    assert!(auth.is_signed_in());

    let readiness = StubReadinessChecker::new(false);
    assert!(!readiness.is_capture_ready());
    readiness.set_ready(true);
    assert!(readiness.is_capture_ready());
}

// ---------------------------------------------------------------------------
// The transition table: `decide(state, input, ready)`. One pure function holds
// the entire Capture Session lifecycle, ADR-0009/0011/0021 arms included.
// These assertions used to live only inside the async coordinator.
// ---------------------------------------------------------------------------

fn cmd(c: CoordinatorCommand) -> CaptureInput {
    CaptureInput::Command(c)
}

// --- Toggle ----------------------------------------------------------------

#[test]
fn toggle_from_capturing_stops_session() {
    let t = decide(
        &CaptureState::Capturing,
        &cmd(CoordinatorCommand::ToggleRequested),
        true,
    )
    .expect("Capturing is toggleable");
    assert_eq!(t.next, CaptureState::Stopped);
    assert_eq!(t.effect, Effect::StopSession(SessionEndReason::UserToggle));
}

#[test]
fn toggle_from_stopped_with_readiness_starts_session() {
    let t = decide(
        &CaptureState::Stopped,
        &cmd(CoordinatorCommand::ToggleRequested),
        true,
    )
    .expect("Stopped is toggleable");
    assert_eq!(t.next, CaptureState::Capturing);
    assert_eq!(t.effect, Effect::StartSession);
}

#[test]
fn toggle_from_stopped_without_readiness_blocks_to_setup_required() {
    let t = decide(
        &CaptureState::Stopped,
        &cmd(CoordinatorCommand::ToggleRequested),
        false,
    )
    .expect("Stopped toggle is observable even when blocked");
    assert_eq!(t.next, CaptureState::SetupRequired);
    assert_eq!(t.effect, Effect::None, "stale Stopped must not start capture");
}

#[test]
fn toggle_from_non_toggleable_states_is_ignored() {
    for state in [
        CaptureState::Unauthenticated,
        CaptureState::SetupRequired,
        CaptureState::Error(err("boom")),
    ] {
        assert!(
            decide(&state, &cmd(CoordinatorCommand::ToggleRequested), true).is_none(),
            "{state:?} must not be toggleable",
        );
    }
}

// --- SignInCompleted -------------------------------------------------------

#[test]
fn sign_in_completed_when_ready_starts_session() {
    let t = decide(
        &CaptureState::Unauthenticated,
        &cmd(CoordinatorCommand::SignInCompleted),
        true,
    )
    .expect("sign-in always transitions");
    assert_eq!(t.next, CaptureState::Capturing);
    assert_eq!(t.effect, Effect::StartSession);
}

#[test]
fn sign_in_completed_when_not_ready_blocks_to_setup_required() {
    let t = decide(
        &CaptureState::Unauthenticated,
        &cmd(CoordinatorCommand::SignInCompleted),
        false,
    )
    .expect("sign-in always transitions");
    assert_eq!(t.next, CaptureState::SetupRequired);
    assert_eq!(t.effect, Effect::None);
}

// --- ReadinessChanged ------------------------------------------------------

#[test]
fn readiness_true_from_setup_required_starts_session() {
    let t = decide(
        &CaptureState::SetupRequired,
        &cmd(CoordinatorCommand::ReadinessChanged(true)),
        true,
    )
    .expect("setup-required + ready resumes");
    assert_eq!(t.next, CaptureState::Capturing);
    assert_eq!(t.effect, Effect::StartSession);
}

#[test]
fn readiness_false_from_capturing_stops_session() {
    let t = decide(
        &CaptureState::Capturing,
        &cmd(CoordinatorCommand::ReadinessChanged(false)),
        false,
    )
    .expect("revoked readiness pauses capture");
    assert_eq!(t.next, CaptureState::SetupRequired);
    assert_eq!(
        t.effect,
        Effect::StopSession(SessionEndReason::Quit),
        "coordinator-initiated stop calls supervisor.stop()",
    );
}

#[test]
fn readiness_false_from_error_recovers_without_stopping() {
    // ADR-0011/0021: the readiness poll is the single permission authority.
    // Once it sees the grant gone, reclassify Error → SetupRequired with NO
    // supervisor.stop() (ScreenPipe already dead, heartbeat already ended).
    let t = decide(
        &CaptureState::Error(err("crashed")),
        &cmd(CoordinatorCommand::ReadinessChanged(false)),
        false,
    )
    .expect("error recovers through setup on revoked grant");
    assert_eq!(t.next, CaptureState::SetupRequired);
    assert_eq!(t.effect, Effect::None);
}

#[test]
fn readiness_changes_that_change_nothing_are_ignored() {
    let ignored = [
        (CaptureState::Capturing, true),
        (CaptureState::Stopped, false),
        (CaptureState::Stopped, true),
        (CaptureState::Error(err("persistent")), true),
        (CaptureState::SetupRequired, false),
        (CaptureState::Unauthenticated, true),
        (CaptureState::Unauthenticated, false),
    ];
    for (state, now_ready) in ignored {
        assert!(
            decide(
                &state,
                &cmd(CoordinatorCommand::ReadinessChanged(now_ready)),
                now_ready,
            )
            .is_none(),
            "ReadinessChanged({now_ready}) from {state:?} must be a no-op",
        );
    }
}

// --- SimulateError ---------------------------------------------------------

#[test]
fn simulate_error_drives_to_error_from_any_state() {
    let reason = err("Simulated error for smoke test");
    for state in [
        CaptureState::Unauthenticated,
        CaptureState::SetupRequired,
        CaptureState::Stopped,
        CaptureState::Capturing,
        CaptureState::Error(err("old")),
    ] {
        let t = decide(
            &state,
            &cmd(CoordinatorCommand::SimulateError(reason.clone())),
            true,
        )
        .expect("simulate error always transitions");
        assert_eq!(t.next, CaptureState::Error(reason.clone()));
        assert_eq!(t.effect, Effect::None);
    }
}

// --- Supervisor events -----------------------------------------------------

#[test]
fn supervisor_stopped_while_capturing_settles_to_stopped() {
    let t = decide(&CaptureState::Capturing, &CaptureInput::SupervisorStopped, true)
        .expect("a clean stop while capturing settles");
    assert_eq!(t.next, CaptureState::Stopped);
    assert_eq!(
        t.effect,
        Effect::EndSession(SessionEndReason::Quit),
        "supervisor already stopped — end heartbeat only, no supervisor.stop()",
    );
}

#[test]
fn supervisor_stopped_outside_capturing_is_ignored() {
    for state in [
        CaptureState::Unauthenticated,
        CaptureState::SetupRequired,
        CaptureState::Stopped,
        CaptureState::Error(err("boom")),
    ] {
        assert!(
            decide(&state, &CaptureInput::SupervisorStopped, true).is_none(),
            "late Stopped must not clobber {state:?}",
        );
    }
}

#[test]
fn supervisor_crashed_while_capturing_drives_to_error_with_copy() {
    let t = decide(
        &CaptureState::Capturing,
        &CaptureInput::SupervisorCrashed {
            user_facing_copy: "Can't start — port conflict".to_string(),
        },
        true,
    )
    .expect("a crash while capturing surfaces Error");
    assert_eq!(t.next, CaptureState::Error(err("Can't start — port conflict")));
    assert_eq!(
        t.effect,
        Effect::EndSession(SessionEndReason::Crash),
        "supervisor already crashed — end heartbeat only, no supervisor.stop()",
    );
}

#[test]
fn supervisor_crashed_outside_capturing_is_ignored() {
    for state in [
        CaptureState::Unauthenticated,
        CaptureState::SetupRequired,
        CaptureState::Stopped,
        CaptureState::Error(err("boom")),
    ] {
        assert!(
            decide(
                &state,
                &CaptureInput::SupervisorCrashed {
                    user_facing_copy: "late crash".to_string(),
                },
                true,
            )
            .is_none(),
            "late crash must not overwrite {state:?}",
        );
    }
}
