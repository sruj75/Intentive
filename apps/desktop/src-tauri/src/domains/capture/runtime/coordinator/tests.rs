//! Coordinator tests are *wiring* tests: the full transition table is proven
//! purely in `service::decide` (see `service/tests.rs`). Here we only assert
//! that the async run loop routes both channels into `decide` and dispatches
//! each `Effect` correctly — that a `StartSession` actually starts the
//! supervisor and the heartbeat, a `StopSession` stops both, an `EndSession`
//! ends the heartbeat *without* re-stopping an already-dead supervisor, and
//! that observers fire exactly once per transition.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use tokio::sync::mpsc;

use crate::domains::capture::runtime::screenpipe_supervisor::{
    Supervisor, SupervisorError, SupervisorEvent,
};
use crate::domains::capture::service::{StubAuthChecker, StubReadinessChecker};
use crate::domains::capture::types::session::SessionHooks;
use crate::domains::capture::types::state::{CaptureState, ErrorReason};
use crate::domains::snapshots::types::SessionEndReason;

use super::{CaptureSessionCoordinator, CoordinatorCommand, StateObserver};

/// Ordered cross-collaborator trace shared by `FakeSupervisor` and
/// `RecordingHooks`, so a test can assert the relative order of
/// `on_session_end` (Session End Marker emit) vs `supervisor.stop`.
type EventLog = Arc<Mutex<Vec<&'static str>>>;

/// Records calls so coordinator tests can assert "supervisor.stop was called".
/// When handed a shared [`EventLog`], it also appends an ordered trace entry so
/// teardown ordering can be asserted against the heartbeat hooks.
#[derive(Default)]
struct FakeSupervisor {
    start_calls: AtomicUsize,
    stop_calls: AtomicUsize,
    log: Option<EventLog>,
}

impl FakeSupervisor {
    fn with_log(log: EventLog) -> Self {
        Self {
            log: Some(log),
            ..Default::default()
        }
    }

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
        if let Some(log) = &self.log {
            log.lock().unwrap().push("supervisor.stop");
        }
        Ok(())
    }
}

/// Records the heartbeat lifecycle hooks the coordinator fires, so dispatch
/// tests can prove the Session End Marker actually fires (and with which
/// reason) per effect.
#[derive(Default)]
struct RecordingHooks {
    starts: AtomicUsize,
    ends: Mutex<Vec<SessionEndReason>>,
    log: Option<EventLog>,
}

impl RecordingHooks {
    fn with_log(log: EventLog) -> Self {
        Self {
            log: Some(log),
            ..Default::default()
        }
    }

    fn start_count(&self) -> usize {
        self.starts.load(Ordering::SeqCst)
    }

    fn end_reasons(&self) -> Vec<SessionEndReason> {
        self.ends.lock().unwrap().clone()
    }
}

#[async_trait]
impl SessionHooks for RecordingHooks {
    async fn on_session_start(&self) {
        self.starts.fetch_add(1, Ordering::SeqCst);
    }

    async fn on_session_end(&self, reason: SessionEndReason) {
        self.ends.lock().unwrap().push(reason);
        if let Some(log) = &self.log {
            log.lock().unwrap().push("on_session_end");
        }
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
    // per toggle. The coordinator must collapse that to exactly one
    // notification per observable transition.
    let supervisor = Arc::new(FakeSupervisor::default());
    let (_sup_tx, sup_rx) = spawn_supervisor_channel();
    let auth = StubAuthChecker::new(true);
    let readiness = Arc::new(StubReadinessChecker::new(true));
    let coord = CaptureSessionCoordinator::new(supervisor.clone(), sup_rx, &auth, readiness);
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
async fn start_session_effect_starts_supervisor_and_heartbeat() {
    // A `StartSession` effect (here via SignInCompleted from an unauthenticated
    // launch, ADR-0009) must both start the supervisor and fire the heartbeat's
    // session-start hook.
    let supervisor = Arc::new(FakeSupervisor::default());
    let (_sup_tx, sup_rx) = spawn_supervisor_channel();
    let auth = StubAuthChecker::new(false);
    let readiness = Arc::new(StubReadinessChecker::new(true));
    let coord = CaptureSessionCoordinator::new(supervisor.clone(), sup_rx, &auth, readiness);
    let hooks = Arc::new(RecordingHooks::default());
    coord.set_heartbeat(hooks.clone());
    let observer = Arc::new(RecordingObserver::default());
    coord.subscribe(observer.clone());
    assert_eq!(coord.snapshot(), CaptureState::Unauthenticated);
    tokio::spawn(coord.clone().run());

    coord.submit(CoordinatorCommand::SignInCompleted);

    wait_for(&observer, CaptureState::Capturing).await;
    assert_eq!(supervisor.start_count(), 1);
    assert_eq!(hooks.start_count(), 1);
}

#[tokio::test]
async fn stop_session_effect_stops_supervisor_and_ends_heartbeat() {
    // A coordinator-initiated stop (`StopSession`, here via revoked readiness
    // while Capturing) must call supervisor.stop() AND end the heartbeat with
    // the Quit reason.
    let supervisor = Arc::new(FakeSupervisor::default());
    let (_sup_tx, sup_rx) = spawn_supervisor_channel();
    let auth = StubAuthChecker::new(true);
    let readiness = Arc::new(StubReadinessChecker::new(true));
    let coord = CaptureSessionCoordinator::new(supervisor.clone(), sup_rx, &auth, readiness);
    let hooks = Arc::new(RecordingHooks::default());
    coord.set_heartbeat(hooks.clone());
    let observer = Arc::new(RecordingObserver::default());
    coord.subscribe(observer.clone());
    assert_eq!(coord.snapshot(), CaptureState::Capturing);
    tokio::spawn(coord.clone().run());

    coord.submit(CoordinatorCommand::ReadinessChanged(false));

    wait_for(&observer, CaptureState::SetupRequired).await;
    assert_eq!(supervisor.stop_count(), 1);
    assert_eq!(hooks.end_reasons(), vec![SessionEndReason::Quit]);
}

#[tokio::test]
async fn stop_session_emits_marker_before_stopping_supervisor() {
    // #35 (ADR-0022): a coordinator-initiated `StopSession` must emit the
    // Session End Marker (via `on_session_end`) BEFORE `supervisor.stop()`, so
    // the marker provably leaves the process before ScreenPipe exits. Both
    // collaborators append to a shared ordered log; the marker hook must land
    // first.
    let log: EventLog = Arc::new(Mutex::new(Vec::new()));
    let supervisor = Arc::new(FakeSupervisor::with_log(log.clone()));
    let (_sup_tx, sup_rx) = spawn_supervisor_channel();
    let auth = StubAuthChecker::new(true);
    let readiness = Arc::new(StubReadinessChecker::new(true));
    let coord = CaptureSessionCoordinator::new(supervisor.clone(), sup_rx, &auth, readiness);
    let hooks = Arc::new(RecordingHooks::with_log(log.clone()));
    coord.set_heartbeat(hooks.clone());
    let observer = Arc::new(RecordingObserver::default());
    coord.subscribe(observer.clone());
    assert_eq!(coord.snapshot(), CaptureState::Capturing);
    tokio::spawn(coord.clone().run());

    coord.submit(CoordinatorCommand::ReadinessChanged(false));

    wait_for(&observer, CaptureState::SetupRequired).await;
    assert_eq!(
        log.lock().unwrap().clone(),
        vec!["on_session_end", "supervisor.stop"],
        "the Session End Marker must be emitted before ScreenPipe is stopped",
    );
}

#[tokio::test]
async fn end_session_effect_ends_heartbeat_without_stopping_supervisor() {
    // A supervisor Crashed event routes through the supervisor channel and maps
    // to an `EndSession(Crash)` effect: ScreenPipe is already dead, so the
    // heartbeat marker must fire while supervisor.stop() is NOT re-issued. Also
    // proves the user-facing copy is carried onto the Error reason.
    let supervisor = Arc::new(FakeSupervisor::default());
    let (sup_tx, sup_rx) = spawn_supervisor_channel();
    let auth = StubAuthChecker::new(true);
    let readiness = Arc::new(StubReadinessChecker::new(true));
    let coord = CaptureSessionCoordinator::new(supervisor.clone(), sup_rx, &auth, readiness);
    let hooks = Arc::new(RecordingHooks::default());
    coord.set_heartbeat(hooks.clone());
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
    assert_eq!(
        supervisor.stop_count(),
        0,
        "an already-crashed supervisor must not be re-stopped",
    );
    assert_eq!(hooks.end_reasons(), vec![SessionEndReason::Crash]);
}

#[tokio::test]
async fn toggle_samples_live_readiness_at_apply_time() {
    // `decide` is pure over a `ready` bool; the coordinator must sample live
    // readiness at apply time. A stale Stopped state under a now-revoked grant
    // must block to SetupRequired without starting capture.
    let supervisor = Arc::new(FakeSupervisor::default());
    let (_sup_tx, sup_rx) = spawn_supervisor_channel();
    let auth = StubAuthChecker::new(true);
    let readiness = Arc::new(StubReadinessChecker::new(true));
    let coord =
        CaptureSessionCoordinator::new(supervisor.clone(), sup_rx, &auth, readiness.clone());
    let observer = Arc::new(RecordingObserver::default());
    coord.subscribe(observer.clone());
    tokio::spawn(coord.clone().run());

    coord.submit(CoordinatorCommand::ToggleRequested);
    wait_for(&observer, CaptureState::Stopped).await;
    readiness.set_ready(false);

    coord.submit(CoordinatorCommand::ToggleRequested);

    wait_for(&observer, CaptureState::SetupRequired).await;
    assert_eq!(
        supervisor.start_count(),
        0,
        "stale Stopped state must not start capture when live readiness is false",
    );
}
