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

use crate::capture_state::{
    AuthChecker, CaptureState, CaptureStateMachine, ErrorReason, TransitionError,
};
use crate::screenpipe_supervisor::{Supervisor, SupervisorEvent};

/// Domain commands the coordinator consumes. Producers (menu bar, future auth
/// adapter, debug shims) publish these via `submit`; the coordinator decides
/// the effect.
#[derive(Debug, Clone)]
pub enum CoordinatorCommand {
    /// User clicked the menu bar toggle.
    ToggleRequested,
    /// Sign-in (and consent) just completed. Auto-starts a Capture Session per
    /// ADR-0009.
    SignInCompleted,
    /// Debug-only: drive the FSM straight to Capture Error. Replaces the
    /// previous `simulate_error` Tauri command path.
    SimulateError(ErrorReason),
}

/// Receivers of state-change notifications. The menu bar registers exactly one
/// observer at install time to re-render the tray; tests use a recording
/// observer.
pub trait StateObserver: Send + Sync {
    fn on_state(&self, state: &CaptureState);
}

struct Inner {
    fsm: Mutex<CaptureStateMachine>,
    observers: Mutex<Vec<Arc<dyn StateObserver>>>,
    supervisor: Arc<dyn Supervisor>,
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
    ) -> Arc<Self> {
        let (command_tx, command_rx) = mpsc::unbounded_channel();
        let fsm = CaptureStateMachine::from_auth(auth);
        Arc::new(Self {
            inner: Arc::new(Inner {
                fsm: Mutex::new(fsm),
                observers: Mutex::new(Vec::new()),
                supervisor,
                command_tx,
            }),
            command_rx: Mutex::new(Some(command_rx)),
            supervisor_rx: Mutex::new(Some(supervisor_rx)),
        })
    }

    /// Publish a domain command. Non-blocking; the command is queued for the
    /// coordinator's `run` task.
    pub fn submit(&self, command: CoordinatorCommand) {
        // Receiver gone implies the coordinator's `run` task is no longer
        // active; dropping the command is the correct shutdown behaviour.
        let _ = self.inner.command_tx.send(command);
    }

    pub fn subscribe(&self, observer: Arc<dyn StateObserver>) {
        self.inner.observers.lock().expect("observers poisoned").push(observer);
    }

    pub fn snapshot(&self) -> CaptureState {
        self.inner
            .fsm
            .lock()
            .expect("fsm poisoned")
            .state()
            .clone()
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
                    Some(evt) => self.inner.handle_supervisor_event(evt),
                    None => {
                        // Supervisor channel closed; keep listening for commands.
                        continue;
                    }
                },
            }
        }
    }
}

impl Inner {
    fn notify_observers(&self, state: &CaptureState) {
        let observers = self
            .observers
            .lock()
            .expect("observers poisoned")
            .clone();
        for observer in observers {
            observer.on_state(state);
        }
    }

    async fn handle_command(&self, command: CoordinatorCommand) {
        match command {
            CoordinatorCommand::ToggleRequested => self.handle_toggle().await,
            CoordinatorCommand::SignInCompleted => self.handle_sign_in_completed().await,
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
        self.notify_observers(&next);
        match next {
            CaptureState::Capturing => {
                let _ = self.supervisor.start().await;
            }
            CaptureState::Stopped => {
                let _ = self.supervisor.stop().await;
            }
            _ => {}
        }
    }

    async fn handle_sign_in_completed(&self) {
        let next = {
            let mut fsm = self.fsm.lock().expect("fsm poisoned");
            fsm.mark_signed_in().clone()
        };
        self.notify_observers(&next);
        // ADR-0009: completing sign-in starts a Capture Session.
        let _ = self.supervisor.start().await;
    }

    fn handle_simulate_error(&self, reason: ErrorReason) {
        let next = {
            let mut fsm = self.fsm.lock().expect("fsm poisoned");
            fsm.to_error(reason).clone()
        };
        self.notify_observers(&next);
    }

    fn handle_supervisor_event(&self, event: SupervisorEvent) {
        let next = {
            let mut fsm = self.fsm.lock().expect("fsm poisoned");
            match event {
                SupervisorEvent::Stopped => fsm.recover_to_stopped().clone(),
                SupervisorEvent::Crashed { user_facing_copy } => {
                    let reason = ErrorReason::new(user_facing_copy.to_string())
                        .expect("supervisor crash copy is non-empty");
                    fsm.to_error(reason).clone()
                }
            }
        };
        self.notify_observers(&next);
    }
}

#[cfg(test)]
mod tests;
