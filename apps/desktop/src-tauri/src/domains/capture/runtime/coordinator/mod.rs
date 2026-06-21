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
    decide, AuthChecker, CaptureInput, CaptureStateMachine, Effect, ReadinessChecker,
};
use crate::domains::capture::types::session::{
    CaptureSessionControl, CoordinatorCommand, SessionHooks, StateObserver,
};
use crate::domains::capture::types::state::CaptureState;
use crate::domains::snapshots::types::SessionEndReason;
use crate::providers::observability;

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
                    Some(cmd) => self.inner.apply(CaptureInput::Command(cmd)).await,
                    None => return,
                },
                evt = supervisor_rx.recv() => match evt {
                    Some(evt) => self.inner.apply(supervisor_input(evt)).await,
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

    /// Single entry point for both command and supervisor inputs: sample live
    /// readiness, ask the pure `decide` table for the transition, write the new
    /// state under lock, notify observers, then dispatch the effect. All the
    /// lifecycle decisions live in `service::decide`; this is pure wiring.
    async fn apply(&self, input: CaptureInput) {
        let ready = self.readiness.is_capture_ready();
        let transition = {
            let mut fsm = self.fsm.lock().expect("fsm poisoned");
            let Some(transition) = decide(fsm.state(), &input, ready) else {
                return;
            };
            fsm.set(transition.next.clone());
            transition
        };
        // Observers see the settled state before any async effect runs, so a
        // StopSession/EndSession marker fires after the FSM has settled in its
        // terminal state (preserving prior ordering).
        observability::breadcrumb(
            "desktop.capture",
            &format!("capture state: {}", capture_state_label(&transition.next)),
            sentry::Level::Info,
        );
        self.notify_observers(&transition.next);
        match transition.effect {
            Effect::None => {}
            Effect::StartSession => {
                if let Err(err) = self.supervisor.start().await {
                    observability::capture_error(&err);
                }
                self.start_heartbeat().await;
            }
            // Heartbeat before supervisor: the Session End Marker needs the
            // socket, not ScreenPipe — reverse StartSession ordering.
            Effect::StopSession(reason) => {
                self.stop_heartbeat(reason).await;
                if let Err(err) = self.supervisor.stop().await {
                    observability::capture_error(&err);
                }
            }
            // ScreenPipe is already gone (supervisor reported Stopped/Crashed):
            // end the heartbeat without re-issuing supervisor.stop().
            Effect::EndSession(reason) => {
                self.stop_heartbeat(reason).await;
            }
        }
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

fn capture_state_label(state: &CaptureState) -> &'static str {
    match state {
        CaptureState::Unauthenticated => "unauthenticated",
        CaptureState::SetupRequired => "setup_required",
        CaptureState::Stopped => "stopped",
        CaptureState::Capturing => "capturing",
        CaptureState::Error(_) => "error",
    }
}

/// Translate a `runtime`-layer supervisor event into the `service`-owned
/// [`CaptureInput`] the pure `decide` table speaks. This is the cross-layer
/// boundary that keeps `service` free of any `runtime` dependency.
fn supervisor_input(event: SupervisorEvent) -> CaptureInput {
    match event {
        SupervisorEvent::Stopped => CaptureInput::SupervisorStopped,
        SupervisorEvent::Crashed { user_facing_copy } => CaptureInput::SupervisorCrashed {
            user_facing_copy: user_facing_copy.to_string(),
        },
    }
}

#[cfg(test)]
mod tests;
