//! Capture Session coordinator — single owner of the shell-state FSM. Accepts
//! domain commands from the menu bar (and, later, the Auth adapter), drains
//! supervisor events, and notifies subscribed observers on every state change.
//!
//! The coordinator is the deep seam in the orchestration layer: callers see a
//! `submit(CoordinatorCommand)` + `subscribe(StateObserver)` interface;
//! everything else (FSM transitions, supervisor lifecycle dispatch, error copy
//! routing) is hidden inside.

use std::sync::{Arc, Mutex};

use tokio::sync::mpsc;

use crate::domains::capture::runtime::screenpipe_supervisor::{Supervisor, SupervisorEvent};
use crate::domains::capture::service::{
    AuthChecker, CaptureStateMachine, ReadinessChecker, TransitionError,
};
use crate::domains::capture::types::session::{
    CaptureSessionControl, CoordinatorCommand, SessionHooks, StateObserver,
};
use crate::domains::capture::types::state::{CaptureState, ErrorReason};
use crate::domains::snapshots::types::SessionEndReason;

struct Inner {
    fsm: Mutex<CaptureStateMachine>,
    observers: Mutex<Vec<Arc<dyn StateObserver>>>,
    supervisor: Arc<dyn Supervisor>,
    readiness: Arc<dyn ReadinessChecker>,
    /// Installed once after construction via `set_heartbeat`. `None` in tests
    /// that only exercise the FSM ↔ supervisor wiring.
    heartbeat: Mutex<Option<Arc<dyn SessionHooks>>>,
    command_tx: mpsc::UnboundedSender<CoordinatorCommand>,
}

pub struct CaptureSessionCoordinator {
    inner: Arc<Inner>,
    /// Receiver for commands. Moved into `run()`.
    command_rx: Mutex<Option<mpsc::UnboundedReceiver<CoordinatorCommand>>>,
    /// Receiver for supervisor events. Moved into `run()`.
    supervisor_rx: Mutex<Option<mpsc::UnboundedReceiver<SupervisorEvent>>>,
}

impl CaptureSessionCoordinator {
    pub fn new(
        supervisor: Arc<dyn Supervisor>,
        supervisor_rx: mpsc::UnboundedReceiver<SupervisorEvent>,
        auth: &dyn AuthChecker,
        readiness: Arc<dyn ReadinessChecker>,
    ) -> Arc<Self> {
        let (command_tx, command_rx) = mpsc::unbounded_channel();
        let fsm = CaptureStateMachine::from_checks(auth, readiness.as_ref());
        Arc::new(Self {
            inner: Arc::new(Inner {
                fsm: Mutex::new(fsm),
                observers: Mutex::new(Vec::new()),
                supervisor,
                readiness,
                heartbeat: Mutex::new(None),
                command_tx,
            }),
            command_rx: Mutex::new(Some(command_rx)),
            supervisor_rx: Mutex::new(Some(supervisor_rx)),
        })
    }

    /// Install the Context Heartbeat. Called once at startup from `lib.rs`
    /// after the heartbeat's dependencies are assembled. Coordinator tests
    /// that don't exercise heartbeat lifecycle skip this and the lifecycle
    /// hooks become no-ops.
    pub fn set_heartbeat(&self, heartbeat: Arc<dyn SessionHooks>) {
        *self
            .inner
            .heartbeat
            .lock()
            .expect("heartbeat slot poisoned") = Some(heartbeat);
    }

    /// Publish a domain command. Non-blocking; the command is queued for the
    /// coordinator's `run` task.
    pub fn submit(&self, command: CoordinatorCommand) {
        // Receiver gone implies the coordinator's `run` task is no longer
        // active; dropping the command is the correct shutdown behaviour.
        let _ = self.inner.command_tx.send(command);
    }

    pub fn subscribe(&self, observer: Arc<dyn StateObserver>) {
        self.inner
            .observers
            .lock()
            .expect("observers poisoned")
            .push(observer);
    }

    pub fn snapshot(&self) -> CaptureState {
        self.inner.fsm.lock().expect("fsm poisoned").state().clone()
    }

    /// Drive the coordinator's event loop. Consumes the command and supervisor
    /// channels; should be spawned exactly once.
    pub async fn run(self: Arc<Self>) {
        let mut command_rx = self
            .command_rx
            .lock()
            .expect("command_rx poisoned")
            .take()
            .expect("run() called more than once");
        let mut supervisor_rx = self
            .supervisor_rx
            .lock()
            .expect("supervisor_rx poisoned")
            .take()
            .expect("run() called more than once");

        loop {
            tokio::select! {
                cmd = command_rx.recv() => match cmd {
                    Some(cmd) => self.inner.handle_command(cmd).await,
                    None => return,
                },
                evt = supervisor_rx.recv() => match evt {
                    Some(evt) => self.inner.handle_supervisor_event(evt).await,
                    None => {
                        // Supervisor channel closed; keep listening for commands.
                        continue;
                    }
                },
            }
        }
    }
}

impl CaptureSessionControl for CaptureSessionCoordinator {
    fn submit(&self, command: CoordinatorCommand) {
        CaptureSessionCoordinator::submit(self, command);
    }

    fn subscribe(&self, observer: Arc<dyn StateObserver>) {
        CaptureSessionCoordinator::subscribe(self, observer);
    }

    fn snapshot(&self) -> CaptureState {
        CaptureSessionCoordinator::snapshot(self)
    }
}

impl Inner {
    fn notify_observers(&self, state: &CaptureState) {
        let observers = self.observers.lock().expect("observers poisoned").clone();
        for observer in observers {
            observer.on_state(state);
        }
    }

    async fn handle_command(&self, command: CoordinatorCommand) {
        match command {
            CoordinatorCommand::ToggleRequested => self.handle_toggle().await,
            CoordinatorCommand::SignInCompleted => self.handle_sign_in_completed().await,
            CoordinatorCommand::ReadinessChanged(ready) => {
                self.handle_readiness_changed(ready).await
            }
            CoordinatorCommand::SimulateError(reason) => self.handle_simulate_error(reason),
        }
    }

    async fn handle_toggle(&self) {
        let next = {
            let mut fsm = self.fsm.lock().expect("fsm poisoned");
            match fsm.toggle() {
                Ok(state) => state.clone(),
                Err(TransitionError::NotToggleable) => return,
            }
        };
        match next {
            CaptureState::Capturing => {
                if !self.readiness.is_capture_ready() {
                    let blocked = {
                        let mut fsm = self.fsm.lock().expect("fsm poisoned");
                        fsm.to_setup_required().clone()
                    };
                    self.notify_observers(&blocked);
                    return;
                }
                self.notify_observers(&next);
                let _ = self.supervisor.start().await;
                self.start_heartbeat().await;
            }
            CaptureState::Stopped => {
                self.notify_observers(&next);
                let _ = self.supervisor.stop().await;
                self.stop_heartbeat(SessionEndReason::UserToggle).await;
            }
            _ => self.notify_observers(&next),
        }
    }

    async fn handle_sign_in_completed(&self) {
        let next = {
            let mut fsm = self.fsm.lock().expect("fsm poisoned");
            fsm.mark_signed_in(self.readiness.is_capture_ready())
                .clone()
        };
        self.notify_observers(&next);
        if matches!(next, CaptureState::Capturing) {
            // Completing sign-in starts a Capture Session only when the local
            // permission interlock is already satisfied.
            let _ = self.supervisor.start().await;
            self.start_heartbeat().await;
        }
    }

    async fn handle_readiness_changed(&self, ready: bool) {
        let transition = {
            let mut fsm = self.fsm.lock().expect("fsm poisoned");
            match (fsm.state(), ready) {
                (CaptureState::SetupRequired, true) => Some((fsm.mark_ready().clone(), true)),
                (CaptureState::Capturing, false) => Some((fsm.to_setup_required().clone(), false)),
                _ => None,
            }
        };
        let Some((next, should_start)) = transition else {
            return;
        };
        self.notify_observers(&next);
        if should_start {
            let _ = self.supervisor.start().await;
            self.start_heartbeat().await;
        } else {
            let _ = self.supervisor.stop().await;
            self.stop_heartbeat(SessionEndReason::Quit).await;
        }
    }

    fn handle_simulate_error(&self, reason: ErrorReason) {
        let next = {
            let mut fsm = self.fsm.lock().expect("fsm poisoned");
            fsm.to_error(reason).clone()
        };
        self.notify_observers(&next);
    }

    async fn handle_supervisor_event(&self, event: SupervisorEvent) {
        let crash_readiness = if matches!(event, SupervisorEvent::Crashed { .. }) {
            Some(self.readiness.is_capture_ready())
        } else {
            None
        };
        let (next, reason) = {
            let mut fsm = self.fsm.lock().expect("fsm poisoned");
            match event {
                SupervisorEvent::Stopped => {
                    // The supervisor reports Stopped both for a real child
                    // exit while Capturing and after the readiness-revocation
                    // stop() path that already moved the shell to
                    // SetupRequired. Only honor it as a Capturing -> Stopped
                    // settle; otherwise it would clobber SetupRequired or
                    // Error.
                    if !matches!(fsm.state(), CaptureState::Capturing) {
                        return;
                    }
                    (fsm.recover_to_stopped().clone(), SessionEndReason::Quit)
                }
                SupervisorEvent::Crashed { user_facing_copy } => {
                    // ScreenPipe dying while Capturing is our analog of
                    // ScreenPipe's capture-stream PermissionDenied signal
                    // (ADR-0021). Re-check live readiness outside the FSM lock
                    // and route revoked grants to SetupRequired, not Error.
                    if !matches!(fsm.state(), CaptureState::Capturing) {
                        return;
                    }
                    if crash_readiness.expect("crash readiness checked before fsm lock") {
                        let reason = ErrorReason::new(user_facing_copy.to_string())
                            .expect("supervisor crash copy is non-empty");
                        (fsm.to_error(reason).clone(), SessionEndReason::Crash)
                    } else {
                        (fsm.to_setup_required().clone(), SessionEndReason::Quit)
                    }
                }
            }
        };
        self.notify_observers(&next);
        // ScreenPipe is gone either way — stop the heartbeat so its Session
        // End Marker fires before the FSM settles in its terminal state.
        self.stop_heartbeat(reason).await;
    }

    fn heartbeat_handle(&self) -> Option<Arc<dyn SessionHooks>> {
        self.heartbeat
            .lock()
            .expect("heartbeat slot poisoned")
            .clone()
    }

    async fn start_heartbeat(&self) {
        if let Some(hb) = self.heartbeat_handle() {
            hb.on_session_start().await;
        }
    }

    async fn stop_heartbeat(&self, reason: SessionEndReason) {
        if let Some(hb) = self.heartbeat_handle() {
            hb.on_session_end(reason).await;
        }
    }
}

#[cfg(test)]
mod tests;
