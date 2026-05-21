use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use tokio::sync::mpsc;

use crate::capture_state::{CaptureState, ErrorReason, StubAuthChecker};
use crate::screenpipe_supervisor::{Supervisor, SupervisorError, SupervisorEvent};

use super::{CaptureSessionCoordinator, CoordinatorCommand, StateObserver};

/// Records calls so coordinator tests can assert "supervisor.stop was called".
#[derive(Default)]
struct FakeSupervisor {
    start_calls: AtomicUsize,
    stop_calls: AtomicUsize,
}

impl FakeSupervisor {
    fn start_count(&self) -> usize {
        self.start_calls.load(Ordering::SeqCst)
    }

    fn stop_count(&self) -> usize {
        self.stop_calls.load(Ordering::SeqCst)
    }
}

#[async_trait]
impl Supervisor for FakeSupervisor {
    async fn start(&self) -> Result<(), SupervisorError> {
        self.start_calls.fetch_add(1, Ordering::SeqCst);
        Ok(())
    }

    async fn stop(&self) -> Result<(), SupervisorError> {
        self.stop_calls.fetch_add(1, Ordering::SeqCst);
        Ok(())
    }
}

#[derive(Default)]
struct RecordingObserver {
    history: Mutex<Vec<CaptureState>>,
}

impl RecordingObserver {
    fn last(&self) -> Option<CaptureState> {
        self.history.lock().unwrap().last().cloned()
    }

    fn history(&self) -> Vec<CaptureState> {
        self.history.lock().unwrap().clone()
    }
}

impl StateObserver for RecordingObserver {
    fn on_state(&self, state: &CaptureState) {
        self.history.lock().unwrap().push(state.clone());
    }
}

/// Spin until the observer reports the given state, or fail loudly. Tests use
/// this rather than sleeping a fixed duration so they stay fast and don't
/// flake on slow machines.
async fn wait_for(observer: &RecordingObserver, want: CaptureState) {
    for _ in 0..2_000 {
        if observer.last().as_ref() == Some(&want) {
            return;
        }
        tokio::task::yield_now().await;
    }
    panic!(
        "observer never saw {want:?}; history was {:?}",
        observer.history()
    );
}

fn spawn_supervisor_channel() -> (
    mpsc::UnboundedSender<SupervisorEvent>,
    mpsc::UnboundedReceiver<SupervisorEvent>,
) {
    mpsc::unbounded_channel()
}

#[tokio::test]
async fn observer_fires_once_per_transition() {
    // Regression: today's menu_bar dance fires `refresh_tray` from two sites
    // per toggle (handle_menu_event + dispatch_capture_session). The
    // coordinator must collapse that to exactly one notification per
    // observable transition.
    let supervisor = Arc::new(FakeSupervisor::default());
    let (_sup_tx, sup_rx) = spawn_supervisor_channel();
    let auth = StubAuthChecker::new(true);
    let coord = CaptureSessionCoordinator::new(supervisor.clone(), sup_rx, &auth);
    let observer = Arc::new(RecordingObserver::default());
    coord.subscribe(observer.clone());
    tokio::spawn(coord.clone().run());

    coord.submit(CoordinatorCommand::ToggleRequested);
    wait_for(&observer, CaptureState::Stopped).await;
    coord.submit(CoordinatorCommand::ToggleRequested);
    wait_for(&observer, CaptureState::Capturing).await;

    assert_eq!(
        observer.history(),
        vec![CaptureState::Stopped, CaptureState::Capturing],
        "exactly one observer notification per transition, in order",
    );
}

#[tokio::test]
async fn simulate_error_command_drives_fsm_to_error_and_notifies_observer() {
    // Debug-only smoke path that previously mutated StateHolder directly
    // from a #[tauri::command]. Coordinator surface preserves the behaviour.
    let supervisor = Arc::new(FakeSupervisor::default());
    let (_sup_tx, sup_rx) = spawn_supervisor_channel();
    let auth = StubAuthChecker::new(true);
    let coord = CaptureSessionCoordinator::new(supervisor.clone(), sup_rx, &auth);
    let observer = Arc::new(RecordingObserver::default());
    coord.subscribe(observer.clone());
    tokio::spawn(coord.clone().run());

    let reason = ErrorReason::new("Simulated error for smoke test".to_string()).unwrap();
    coord.submit(CoordinatorCommand::SimulateError(reason.clone()));

    wait_for(&observer, CaptureState::Error(reason)).await;
}

#[tokio::test]
async fn sign_in_completed_marks_signed_in_and_starts_supervisor() {
    // Unauthenticated launch (ADR-0009): the coordinator can't capture
    // until sign-in completes; the SignInCompleted command must transition
    // the FSM to Capturing AND start the supervisor.
    let supervisor = Arc::new(FakeSupervisor::default());
    let (_sup_tx, sup_rx) = spawn_supervisor_channel();
    let auth = StubAuthChecker::new(false);
    let coord = CaptureSessionCoordinator::new(supervisor.clone(), sup_rx, &auth);
    let observer = Arc::new(RecordingObserver::default());
    coord.subscribe(observer.clone());
    assert_eq!(coord.snapshot(), CaptureState::Unauthenticated);
    tokio::spawn(coord.clone().run());

    coord.submit(CoordinatorCommand::SignInCompleted);

    wait_for(&observer, CaptureState::Capturing).await;
    assert_eq!(supervisor.start_count(), 1);
}

#[tokio::test]
async fn supervisor_crashed_event_drives_fsm_to_error_with_carried_copy() {
    let supervisor = Arc::new(FakeSupervisor::default());
    let (sup_tx, sup_rx) = spawn_supervisor_channel();
    let auth = StubAuthChecker::new(true);
    let coord = CaptureSessionCoordinator::new(supervisor.clone(), sup_rx, &auth);
    let observer = Arc::new(RecordingObserver::default());
    coord.subscribe(observer.clone());
    tokio::spawn(coord.clone().run());

    sup_tx
        .send(SupervisorEvent::Crashed {
            user_facing_copy: "Can't start — port conflict",
        })
        .expect("supervisor channel still open");

    let want_reason = ErrorReason::new("Can't start — port conflict".to_string()).unwrap();
    wait_for(&observer, CaptureState::Error(want_reason)).await;
}

#[tokio::test]
async fn supervisor_stopped_event_drives_fsm_to_stopped() {
    // Covers the race where a stop the coordinator did NOT initiate (e.g.
    // ScreenPipe self-exit during a controlled stop) lands on the channel.
    let supervisor = Arc::new(FakeSupervisor::default());
    let (sup_tx, sup_rx) = spawn_supervisor_channel();
    let auth = StubAuthChecker::new(true);
    let coord = CaptureSessionCoordinator::new(supervisor.clone(), sup_rx, &auth);
    let observer = Arc::new(RecordingObserver::default());
    coord.subscribe(observer.clone());
    tokio::spawn(coord.clone().run());

    sup_tx
        .send(SupervisorEvent::Stopped)
        .expect("supervisor channel still open");

    wait_for(&observer, CaptureState::Stopped).await;
}

#[tokio::test]
async fn toggle_from_stopped_starts_supervisor_and_notifies_observer_capturing() {
    let supervisor = Arc::new(FakeSupervisor::default());
    let (_sup_tx, sup_rx) = spawn_supervisor_channel();
    let auth = StubAuthChecker::new(true);
    let coord = CaptureSessionCoordinator::new(supervisor.clone(), sup_rx, &auth);
    let observer = Arc::new(RecordingObserver::default());
    coord.subscribe(observer.clone());
    tokio::spawn(coord.clone().run());

    // First toggle: Capturing → Stopped (verified by cycle 1; here it just
    // gets us into the precondition we want to exercise).
    coord.submit(CoordinatorCommand::ToggleRequested);
    wait_for(&observer, CaptureState::Stopped).await;

    coord.submit(CoordinatorCommand::ToggleRequested);
    wait_for(&observer, CaptureState::Capturing).await;

    assert_eq!(supervisor.start_count(), 1, "second toggle started the supervisor");
    assert_eq!(supervisor.stop_count(), 1, "first toggle stopped the supervisor exactly once");
}

#[tokio::test]
async fn toggle_from_capturing_stops_supervisor_and_notifies_observer_stopped() {
    let supervisor = Arc::new(FakeSupervisor::default());
    let (_sup_tx, sup_rx) = spawn_supervisor_channel();
    let auth = StubAuthChecker::new(true); // signed-in launch ⇒ FSM starts at Capturing
    let coord = CaptureSessionCoordinator::new(supervisor.clone(), sup_rx, &auth);
    let observer = Arc::new(RecordingObserver::default());
    coord.subscribe(observer.clone());

    assert_eq!(coord.snapshot(), CaptureState::Capturing);
    tokio::spawn(coord.clone().run());

    coord.submit(CoordinatorCommand::ToggleRequested);

    wait_for(&observer, CaptureState::Stopped).await;
    assert_eq!(supervisor.stop_count(), 1, "supervisor.stop called exactly once");
    assert_eq!(supervisor.start_count(), 0, "supervisor.start never called");
}
