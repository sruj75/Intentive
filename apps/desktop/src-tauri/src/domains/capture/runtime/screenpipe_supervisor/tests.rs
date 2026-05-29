use std::collections::HashSet;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use async_trait::async_trait;
use tokio::sync::{mpsc, Notify};

use crate::domains::capture::config::{CRASH_COPY, PORT, PORT_CONFLICT_COPY, PORT_FALLBACK};
use super::{
    ChildHandle, ScreenpipeSupervisor, Spawner, Supervisor, SupervisorError, SupervisorEvent,
};

/// Shared control surface for a single fake child. The supervisor holds a
/// `FakeChild` (which references these controls); the test holds a clone via
/// `FakeSpawner::child(n)` to simulate kills and unexpected exits.
struct ChildControls {
    exit_signal: Notify,
    exit_fired: AtomicBool,
    kill_called: AtomicBool,
}

impl ChildControls {
    fn new() -> Self {
        Self {
            exit_signal: Notify::new(),
            exit_fired: AtomicBool::new(false),
            kill_called: AtomicBool::new(false),
        }
    }

    /// Mark the process as exited and wake any waiter. Idempotent — used both
    /// by `kill()` and by tests simulating an unexpected exit.
    fn fire_exit(&self) {
        self.exit_fired.store(true, Ordering::SeqCst);
        self.exit_signal.notify_waiters();
    }

    fn kill_was_called(&self) -> bool {
        self.kill_called.load(Ordering::SeqCst)
    }
}

struct FakeChild {
    controls: Arc<ChildControls>,
}

#[async_trait]
impl ChildHandle for FakeChild {
    async fn wait(&mut self) -> io::Result<()> {
        if self.controls.exit_fired.load(Ordering::SeqCst) {
            return Ok(());
        }
        self.controls.exit_signal.notified().await;
        Ok(())
    }

    async fn kill(&mut self) -> io::Result<()> {
        self.controls.kill_called.store(true, Ordering::SeqCst);
        self.controls.fire_exit();
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct SpawnCall {
    binary: PathBuf,
    port: u16,
}

struct FakeSpawner {
    spawn_calls: Mutex<Vec<SpawnCall>>,
    children: Mutex<Vec<Arc<ChildControls>>>,
    ports_in_use: Mutex<HashSet<u16>>,
    spawn_blocked: AtomicBool,
    spawn_release: Notify,
    spawn_fails: AtomicBool,
}

impl FakeSpawner {
    fn new() -> Self {
        Self {
            spawn_calls: Mutex::new(Vec::new()),
            children: Mutex::new(Vec::new()),
            ports_in_use: Mutex::new(HashSet::new()),
            spawn_blocked: AtomicBool::new(false),
            spawn_release: Notify::new(),
            spawn_fails: AtomicBool::new(false),
        }
    }

    fn spawn_calls(&self) -> Vec<SpawnCall> {
        self.spawn_calls.lock().unwrap().clone()
    }

    fn child(&self, index: usize) -> Arc<ChildControls> {
        self.children.lock().unwrap()[index].clone()
    }

    /// Mark a specific port as in-use for the pre-spawn probe. Call once
    /// per port that should report busy. The supervisor probes primary,
    /// then fallback, so tests can simulate any of the three states:
    /// neither marked (happy path on primary), primary marked (falls back),
    /// both marked (terminal port-conflict).
    fn set_port_in_use(&self, port: u16) {
        self.ports_in_use.lock().unwrap().insert(port);
    }

    fn block_spawn(&self) {
        self.spawn_blocked.store(true, Ordering::SeqCst);
    }

    fn release_spawn(&self) {
        self.spawn_blocked.store(false, Ordering::SeqCst);
        self.spawn_release.notify_waiters();
    }

    fn fail_spawn(&self) {
        self.spawn_fails.store(true, Ordering::SeqCst);
    }
}

#[async_trait]
impl Spawner for FakeSpawner {
    async fn spawn(&self, binary: &Path, port: u16) -> io::Result<Box<dyn ChildHandle>> {
        self.spawn_calls.lock().unwrap().push(SpawnCall {
            binary: binary.to_path_buf(),
            port,
        });
        while self.spawn_blocked.load(Ordering::SeqCst) {
            self.spawn_release.notified().await;
        }
        if self.spawn_fails.load(Ordering::SeqCst) {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                "fake spawn failure",
            ));
        }
        let controls = Arc::new(ChildControls::new());
        self.children.lock().unwrap().push(controls.clone());
        Ok(Box::new(FakeChild { controls }))
    }

    async fn port_in_use(&self, port: u16) -> bool {
        self.ports_in_use.lock().unwrap().contains(&port)
    }
}

/// Pair the supervisor expects under construction. The receiver is the test's
/// observation seam — every supervisor outcome lands here.
fn event_channel() -> (
    mpsc::UnboundedSender<SupervisorEvent>,
    mpsc::UnboundedReceiver<SupervisorEvent>,
) {
    mpsc::unbounded_channel()
}

/// Drain anything the supervisor has already published without awaiting.
/// Use after each act-step in a test, not as a "wait until something happens"
/// helper — the assertions describe the supervisor's terminal events, not its
/// in-flight ones.
fn drain(rx: &mut mpsc::UnboundedReceiver<SupervisorEvent>) -> Vec<SupervisorEvent> {
    let mut events = Vec::new();
    while let Ok(evt) = rx.try_recv() {
        events.push(evt);
    }
    events
}

/// Block until the supervisor has emitted at least one event, then drain.
/// Bounded so a buggy test fails fast instead of hanging the suite.
async fn await_events(rx: &mut mpsc::UnboundedReceiver<SupervisorEvent>) -> Vec<SupervisorEvent> {
    for _ in 0..2_000 {
        let batch = drain(rx);
        if !batch.is_empty() {
            return batch;
        }
        tokio::task::yield_now().await;
    }
    panic!("supervisor never published an event");
}

/// Cooperative wait: yields until the spawner's recorded spawn count reaches
/// `target`. Works under `start_paused = true` because the watcher's
/// non-sleep awaits make progress as soon as we yield.
async fn wait_for_spawn_count(spawner: &FakeSpawner, target: usize) {
    for _ in 0..2_000 {
        if spawner.spawn_calls().len() >= target {
            return;
        }
        tokio::task::yield_now().await;
    }
    panic!(
        "spawn count {} never reached target {target}",
        spawner.spawn_calls().len()
    );
}

#[tokio::test]
async fn start_spawns_child_and_emits_no_event_on_happy_path() {
    let spawner = Arc::new(FakeSpawner::new());
    let binary = PathBuf::from("/fake/screenpipe");
    let (tx, mut rx) = event_channel();
    let supervisor = ScreenpipeSupervisor::new(binary.clone(), spawner.clone(), tx);

    supervisor.start().await.expect("start succeeds");

    let calls = spawner.spawn_calls();
    assert_eq!(calls.len(), 1, "exactly one spawn invocation");
    assert_eq!(calls[0].port, 44380, "spawn uses the ADR-0013 port");
    assert_eq!(calls[0].binary, binary, "spawn uses the configured binary");
    assert!(
        drain(&mut rx).is_empty(),
        "happy-path start emits no events; the coordinator already set Capturing",
    );
}

#[tokio::test]
async fn stop_kills_child_and_emits_stopped() {
    let spawner = Arc::new(FakeSpawner::new());
    let (tx, mut rx) = event_channel();
    let supervisor =
        ScreenpipeSupervisor::new(PathBuf::from("/fake/screenpipe"), spawner.clone(), tx);

    supervisor.start().await.expect("start succeeds");
    supervisor.stop().await.expect("stop succeeds");

    let events = drain(&mut rx);
    assert_eq!(events, vec![SupervisorEvent::Stopped]);
    assert!(
        spawner.child(0).kill_was_called(),
        "the running child was killed",
    );
}

#[tokio::test]
async fn duplicate_start_returns_already_running_and_spawns_once() {
    let spawner = Arc::new(FakeSpawner::new());
    let (tx, _rx) = event_channel();
    let supervisor =
        ScreenpipeSupervisor::new(PathBuf::from("/fake/screenpipe"), spawner.clone(), tx);

    supervisor.start().await.expect("first start succeeds");
    let second = supervisor.start().await;

    assert!(
        matches!(second, Err(SupervisorError::AlreadyRunning)),
        "second start returns AlreadyRunning, got: {second:?}",
    );
    assert_eq!(
        spawner.spawn_calls().len(),
        1,
        "spawn invoked exactly once across both start attempts",
    );
}

#[tokio::test]
async fn start_with_all_candidate_ports_in_use_emits_port_conflict_without_spawning() {
    let spawner = Arc::new(FakeSpawner::new());
    spawner.set_port_in_use(PORT);
    spawner.set_port_in_use(PORT_FALLBACK);
    let (tx, mut rx) = event_channel();
    let supervisor =
        ScreenpipeSupervisor::new(PathBuf::from("/fake/screenpipe"), spawner.clone(), tx);

    supervisor
        .start()
        .await
        .expect("port conflict is reported via event, not Err");

    assert_eq!(
        drain(&mut rx),
        vec![SupervisorEvent::Crashed {
            user_facing_copy: PORT_CONFLICT_COPY,
        }],
    );
    assert_eq!(
        spawner.spawn_calls().len(),
        0,
        "spawn is skipped when every candidate port is occupied",
    );
}

#[tokio::test]
async fn start_falls_back_to_secondary_port_when_primary_is_in_use() {
    let spawner = Arc::new(FakeSpawner::new());
    spawner.set_port_in_use(PORT);
    let (tx, mut rx) = event_channel();
    let supervisor =
        ScreenpipeSupervisor::new(PathBuf::from("/fake/screenpipe"), spawner.clone(), tx);

    supervisor.start().await.expect("start succeeds on fallback");

    let calls = spawner.spawn_calls();
    assert_eq!(calls.len(), 1, "spawn fires exactly once on fallback path");
    assert_eq!(
        calls[0].port, PORT_FALLBACK,
        "spawn uses the fallback port when primary is occupied",
    );
    assert_eq!(
        supervisor.active_url().as_deref(),
        Some("http://127.0.0.1:44382/"),
        "consumers see the same resolved ScreenPipe endpoint the supervisor spawned",
    );
    assert!(
        drain(&mut rx).is_empty(),
        "happy fallback path emits no event — coordinator stays in Capturing",
    );
}

#[tokio::test]
async fn spawn_failure_emits_crash_copy() {
    let spawner = Arc::new(FakeSpawner::new());
    spawner.fail_spawn();
    let (tx, mut rx) = event_channel();
    let supervisor =
        ScreenpipeSupervisor::new(PathBuf::from("/fake/screenpipe"), spawner.clone(), tx);

    supervisor
        .start()
        .await
        .expect("spawn failure is reported via event, not Err");

    assert_eq!(
        drain(&mut rx),
        vec![SupervisorEvent::Crashed {
            user_facing_copy: CRASH_COPY,
        }],
    );
    assert_eq!(spawner.spawn_calls().len(), 1);
}

#[tokio::test]
async fn stop_during_in_flight_start_prevents_child_from_surviving() {
    let spawner = Arc::new(FakeSpawner::new());
    spawner.block_spawn();
    let (tx, mut rx) = event_channel();
    let supervisor =
        ScreenpipeSupervisor::new(PathBuf::from("/fake/screenpipe"), spawner.clone(), tx);

    let start_task = {
        let supervisor = supervisor.clone();
        tokio::spawn(async move { supervisor.start().await })
    };
    wait_for_spawn_count(&spawner, 1).await;

    supervisor.stop().await.expect("stop during start succeeds");
    spawner.release_spawn();
    start_task
        .await
        .expect("start task joins")
        .expect("start resolves cleanly");

    let events = drain(&mut rx);
    assert!(
        events.iter().any(|e| matches!(e, SupervisorEvent::Stopped)),
        "stop wins over the in-flight start, got: {events:?}",
    );
    assert!(
        spawner.child(0).kill_was_called(),
        "the child spawned after stop was immediately killed",
    );
}

#[tokio::test(start_paused = true)]
async fn unexpected_exit_triggers_silent_retry_and_emits_nothing() {
    let spawner = Arc::new(FakeSpawner::new());
    let (tx, mut rx) = event_channel();
    let supervisor =
        ScreenpipeSupervisor::new(PathBuf::from("/fake/screenpipe"), spawner.clone(), tx);

    supervisor.start().await.expect("start succeeds");
    wait_for_spawn_count(&spawner, 1).await;

    // Simulate an unexpected ScreenPipe exit (no `kill()` from supervisor).
    spawner.child(0).fire_exit();
    tokio::task::yield_now().await;
    tokio::time::advance(Duration::from_secs(2)).await;
    wait_for_spawn_count(&spawner, 2).await;

    assert_eq!(
        spawner.spawn_calls().len(),
        2,
        "silent retry spawned a second child",
    );
    assert!(
        drain(&mut rx).is_empty(),
        "silent retry stays invisible to the coordinator",
    );
    assert!(
        !spawner.child(0).kill_was_called(),
        "supervisor did not kill the crashed child (it exited on its own)",
    );
}

#[tokio::test(start_paused = true)]
async fn second_unexpected_exit_emits_crash() {
    let spawner = Arc::new(FakeSpawner::new());
    let (tx, mut rx) = event_channel();
    let supervisor =
        ScreenpipeSupervisor::new(PathBuf::from("/fake/screenpipe"), spawner.clone(), tx);

    supervisor.start().await.expect("start succeeds");
    wait_for_spawn_count(&spawner, 1).await;

    // First unexpected exit — consumes the retry budget.
    spawner.child(0).fire_exit();
    tokio::task::yield_now().await;
    tokio::time::advance(Duration::from_secs(2)).await;
    wait_for_spawn_count(&spawner, 2).await;

    // Second unexpected exit — retry already used, must surface Crashed.
    spawner.child(1).fire_exit();
    let events = await_events(&mut rx).await;

    assert_eq!(
        events,
        vec![SupervisorEvent::Crashed {
            user_facing_copy: CRASH_COPY,
        }],
    );
    assert_eq!(
        spawner.spawn_calls().len(),
        2,
        "no third spawn after retry budget is exhausted",
    );
}

#[tokio::test(start_paused = true)]
async fn stop_after_silent_retry_is_clean_and_resets_retry_budget() {
    let spawner = Arc::new(FakeSpawner::new());
    let (tx, mut rx) = event_channel();
    let supervisor =
        ScreenpipeSupervisor::new(PathBuf::from("/fake/screenpipe"), spawner.clone(), tx);

    // First session: start, crash, silent retry to child 1.
    supervisor.start().await.expect("first start");
    wait_for_spawn_count(&spawner, 1).await;
    spawner.child(0).fire_exit();
    tokio::task::yield_now().await;
    tokio::time::advance(Duration::from_secs(2)).await;
    wait_for_spawn_count(&spawner, 2).await;

    // Stop while child 1 is running — must emit Stopped and leave the
    // supervisor ready to start again without `AlreadyRunning`.
    supervisor.stop().await.expect("stop after retry succeeds");
    assert_eq!(drain(&mut rx), vec![SupervisorEvent::Stopped]);

    // Second session: fresh retry budget should allow another silent retry.
    supervisor.start().await.expect("second start succeeds");
    wait_for_spawn_count(&spawner, 3).await;
    spawner.child(2).fire_exit();
    tokio::task::yield_now().await;
    tokio::time::advance(Duration::from_secs(2)).await;
    wait_for_spawn_count(&spawner, 4).await;

    assert_eq!(
        spawner.spawn_calls().len(),
        4,
        "four spawns total: initial + retry across two independent sessions",
    );
    assert!(
        drain(&mut rx).is_empty(),
        "second session's silent retry stays invisible",
    );
}

#[tokio::test(start_paused = true)]
async fn controlled_stop_does_not_trigger_retry() {
    let spawner = Arc::new(FakeSpawner::new());
    let (tx, mut rx) = event_channel();
    let supervisor =
        ScreenpipeSupervisor::new(PathBuf::from("/fake/screenpipe"), spawner.clone(), tx);

    supervisor.start().await.expect("start");
    wait_for_spawn_count(&spawner, 1).await;

    supervisor.stop().await.expect("stop");

    // If the watcher had mistakenly entered the retry path (ADR-0012
    // ordering violation), advancing past the retry delay would expose a
    // second spawn. Intent must be set BEFORE kill so the watcher routes the
    // exit to Stopped, not to the retry branch.
    tokio::time::advance(Duration::from_secs(5)).await;
    tokio::task::yield_now().await;

    assert_eq!(
        spawner.spawn_calls().len(),
        1,
        "controlled stop must not trigger the silent retry path (ADR-0012)",
    );
    assert_eq!(drain(&mut rx), vec![SupervisorEvent::Stopped]);
}
