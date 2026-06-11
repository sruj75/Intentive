pub mod domains;
pub mod providers;

use std::sync::Arc;

use async_trait::async_trait;
use tauri::path::BaseDirectory;
use tauri::Emitter;
use tauri::Manager;
use tauri::WebviewWindow;
use tokio::sync::Mutex;
use url::Url;

use domains::capture::runtime::coordinator::CaptureSessionCoordinator;
use domains::capture::runtime::permission_monitor::PermissionMonitor;
use domains::capture::runtime::screenpipe_supervisor::{
    OsSpawner, ScreenpipeEndpoint, ScreenpipeSupervisor, Spawner, Supervisor,
};
use domains::capture::service::{AuthChecker, ReadinessChecker, StubAuthChecker};
use domains::capture::types::session::{CaptureSessionControl, CoordinatorCommand, SessionHooks};
use domains::capture::types::state::CaptureState;
use domains::routing::runtime::{
    DisabledRoutingSource, FastrandJitter, FixtureRoutingSource, RoutingFetcher, RoutingObserver,
    RoutingSource, TungsteniteTransport, WsSession,
};
use domains::routing::types::{ConnectionStatus, RoutingState, SessionState};
use domains::snapshots::repo::SnapshotStore;
use domains::snapshots::runtime::agent_interface::{AgentSink, NoopAgentSink};
use domains::snapshots::runtime::heartbeat::{
    ContextHeartbeat, ReqwestActivityClient, ScreenpipeUrlSource, Summarizer, SummarizerError,
};
use domains::snapshots::types::SessionEndReason;
use domains::summarization::config::ProviderConfig;
use domains::summarization::service::LlmProvider;
use providers::permissions::{CapturePermissions, MacosCapturePermissions};
use tokio::sync::mpsc;

/// Tauri-managed state for the resolved on-device LLM Provider. Starts as
/// `None`; the Context Heartbeat prepares any already-available tier when a
/// Capture Session starts, while `start_model_download` supplies Tier 3 after
/// explicit onboarding consent. A tick skips only while no tier is ready.
pub struct LlmProviderSlot(pub Mutex<Option<Arc<LlmProvider>>>);

/// Production adapter wiring `LlmProviderSlot` behind the heartbeat's
/// `Summarizer` seam. Lives here (not in `context_heartbeat`) because
/// `LlmProviderSlot` is a Tauri-state concern owned by this wiring layer.
struct LlmProviderSlotSummarizer {
    slot: Arc<LlmProviderSlot>,
    config: ProviderConfig,
    screenpipe_endpoint: ScreenpipeEndpoint,
    http: reqwest::Client,
}

#[async_trait]
impl Summarizer for LlmProviderSlotSummarizer {
    async fn prepare(&self) {
        self.resolve_ready_if_needed().await;
    }

    async fn summarize(&self, activity: &str) -> Result<String, SummarizerError> {
        self.resolve_ready_if_needed().await;
        let provider = {
            let guard = self.slot.0.lock().await;
            guard.as_ref().cloned().ok_or(SummarizerError::Unresolved)?
        };
        provider
            .summarize(activity)
            .await
            .map_err(|e| SummarizerError::Failed(e.to_string()))
    }
}

impl LlmProviderSlotSummarizer {
    async fn resolve_ready_if_needed(&self) {
        if self.slot.0.lock().await.is_some() {
            return;
        }
        let mut config = self.config.clone();
        config.screenpipe_url = self.screenpipe_endpoint.current_or_primary_url();
        if let Ok(provider) = LlmProvider::resolve_ready(config, self.http.clone()).await {
            *self.slot.0.lock().await = Some(Arc::new(provider));
        }
    }
}

/// Composition-root adapter exposing the capture domain's `ScreenpipeEndpoint`
/// through the snapshots domain's `ScreenpipeUrlSource` seam. Lives here so
/// neither domain depends on the other — only `lib.rs` knows both.
impl ScreenpipeUrlSource for ScreenpipeEndpoint {
    fn current_or_primary_url(&self) -> Url {
        ScreenpipeEndpoint::current_or_primary_url(self)
    }
}

/// Composition-root adapter wiring the snapshots-domain Context Heartbeat into
/// the capture-domain coordinator's `SessionHooks` seam, so the coordinator
/// never names the heartbeat type directly.
struct HeartbeatHooks(Arc<ContextHeartbeat>);

#[async_trait]
impl SessionHooks for HeartbeatHooks {
    async fn on_session_start(&self) {
        let _ = self.0.clone().start().await;
    }

    async fn on_session_end(&self, reason: SessionEndReason) {
        self.0.clone().stop(reason).await;
    }
}

struct TauriRoutingObserver {
    app: tauri::AppHandle,
}

impl RoutingObserver for TauriRoutingObserver {
    fn observe(&self, routing_state: RoutingState, session_state: SessionState) {
        let status = domains::routing::runtime::status_for(routing_state, session_state);
        let _ = self.app.emit("routing:status", status);
    }
}

/// Tauri-managed state for the `ProviderConfig` resolved at startup. The
/// command path reads this to drive `LlmProvider::resolve_with_progress`.
pub struct ProviderConfigState {
    pub config: ProviderConfig,
    pub screenpipe_endpoint: ScreenpipeEndpoint,
}

/// Force the settings webview to the onboarding surface and bring it
/// forward. Matches the URL-mutation pattern `menu_bar::open_settings_window`
/// uses for the sign-in surface — same single window, different `?surface=`
/// query value.
fn open_onboarding_window(window: &WebviewWindow) {
    let _ = window.eval("window.location.search = '?surface=onboarding';");
    let _ = window.show();
    let _ = window.set_focus();
}

fn open_permission_setup_window(window: &WebviewWindow) {
    let _ = window.eval("window.location.search = '?surface=permission-setup';");
    let _ = window.show();
    let _ = window.set_focus();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // The ScreenPipe Supervisor owns the child process; the Capture
            // Session coordinator owns the shell-state FSM and orchestrates
            // start/stop. The supervisor publishes outcomes on its events
            // channel, which the coordinator drains.
            let binary_path = app
                .path()
                .resolve("resources/screenpipe", BaseDirectory::Resource)?;
            let spawner: Arc<dyn Spawner> = Arc::new(OsSpawner);
            let (events_tx, events_rx) = mpsc::unbounded_channel();
            let supervisor = ScreenpipeSupervisor::new(binary_path, spawner, events_tx);

            let auth = StubAuthChecker::new(false);
            let signed_in = auth.is_signed_in();
            let permissions = Arc::new(MacosCapturePermissions);
            app.manage(permissions.clone() as Arc<dyn CapturePermissions>);
            let coordinator: Arc<CaptureSessionCoordinator> = CaptureSessionCoordinator::new(
                supervisor.clone() as Arc<dyn Supervisor>,
                events_rx,
                &auth,
                permissions.clone() as Arc<dyn ReadinessChecker>,
            );
            app.manage(coordinator.clone() as Arc<dyn CaptureSessionControl>);
            app.manage(supervisor.clone());

            // Snapshot Store (Issue #6, ADR-0007). Opens or creates the local
            // SQLite file, runs migrations, and purges rows older than 7 days
            // before the first caller (Context Heartbeat) can hand it a row.
            // `block_on` is acceptable here — migrations + purge finish in
            // milliseconds and the store must be ready before app.manage().
            let db_path = app
                .path()
                .resolve("intentive.db", BaseDirectory::AppLocalData)?;
            if let Some(parent) = db_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let snapshot_store = tauri::async_runtime::block_on(SnapshotStore::new(&db_path))
                .map_err(|e| Box::<dyn std::error::Error>::from(e.to_string()))?;
            app.manage(Arc::new(snapshot_store));

            tauri::async_runtime::spawn(coordinator.clone().run());
            PermissionMonitor::new(
                permissions.clone() as Arc<dyn ReadinessChecker>,
                coordinator.clone() as Arc<dyn CaptureSessionControl>,
            )
            .spawn();

            domains::menubar::ui::install(
                app,
                coordinator.clone() as Arc<dyn CaptureSessionControl>,
            )?;

            // LLM Provider wiring (Issue #7, ADR-0006, ADR-0018). The slot
            // starts empty — Tier 3 may need a model download that drives
            // through the `start_model_download` command. The Context
            // Heartbeat reads this at tick time; if `None`, skips the tick.
            let bundled_ollama_binary = app
                .path()
                .resolve("resources/ollama", BaseDirectory::Resource)?;
            let provider_config = ProviderConfig {
                screenpipe_url: supervisor.endpoint().current_or_primary_url(),
                bundled_ollama_binary,
                ..ProviderConfig::default()
            };
            let screenpipe_endpoint = supervisor.endpoint();
            app.manage(ProviderConfigState {
                config: provider_config.clone(),
                screenpipe_endpoint: screenpipe_endpoint.clone(),
            });
            let llm_slot = Arc::new(LlmProviderSlot(Mutex::new(None)));
            app.manage(llm_slot.clone());

            // Routing + Protocol WebSocket session skeleton (Issue #31). The
            // webview supplies only the login token after sign-in; Rust owns the
            // Control Plane `GET /agent` lookup, the long-lived socket, and the
            // reconnect/refresh loop. Snapshot event sends remain intentionally
            // inert until #34 plugs the heartbeat sink into this live session.
            let control_plane_routing_source = || -> Arc<dyn RoutingSource> {
                match domains::routing::config::default_control_plane_base_url()
                    .and_then(|raw| Url::parse(&raw).ok())
                {
                    Some(base_url) => Arc::new(RoutingFetcher::with_permissions(
                        base_url,
                        reqwest::Client::new(),
                        permissions.clone() as Arc<dyn CapturePermissions>,
                    )),
                    None => Arc::new(DisabledRoutingSource),
                }
            };
            let routing_source: Arc<dyn RoutingSource> = match FixtureRoutingSource::from_env() {
                Ok(Some(fixture)) => Arc::new(fixture),
                Ok(None) => control_plane_routing_source(),
                // A malformed fixture must not disable routing when a real
                // Control Plane URL is configured — log and fall through.
                Err(err) => {
                    eprintln!("routing: fixture ignored, falling back to Control Plane: {err}");
                    control_plane_routing_source()
                }
            };
            let routing_session = WsSession::new(
                routing_source,
                Arc::new(TungsteniteTransport),
                Arc::new(TauriRoutingObserver {
                    app: app.handle().clone(),
                }),
                Arc::new(FastrandJitter),
            );
            app.manage(routing_session);
            let _ = app.emit(
                "routing:status",
                ConnectionStatus {
                    mood: domains::routing::types::ConnectionMood::SignedOut,
                },
            );

            // Context Heartbeat (Issue #8, ADR-0008). The placeholder runtime
            // sink is intentionally inert until #34 wires actual Protocol event
            // emission through the live routing session. It reports "not
            // connected" so the Snapshot Store keeps `pushed_at = NULL`.
            let snapshot_store_arc: Arc<SnapshotStore> =
                app.state::<Arc<SnapshotStore>>().inner().clone();
            let http = reqwest::Client::new();
            let agent_sink: Arc<dyn AgentSink> = Arc::new(NoopAgentSink);
            let summarizer = Arc::new(LlmProviderSlotSummarizer {
                slot: llm_slot.clone(),
                config: provider_config,
                screenpipe_endpoint: screenpipe_endpoint.clone(),
                http: http.clone(),
            });
            let activity_client = Arc::new(ReqwestActivityClient::new(http));
            let heartbeat = ContextHeartbeat::new(
                summarizer,
                activity_client,
                Arc::new(screenpipe_endpoint) as Arc<dyn ScreenpipeUrlSource>,
                snapshot_store_arc,
                agent_sink,
            );
            coordinator.set_heartbeat(Arc::new(HeartbeatHooks(heartbeat)));

            // Signed-in launch auto-starts a Capture Session per ADR-0009.
            // Install orchestration collaborators first so startup cannot
            // begin capture without a corresponding Context Heartbeat.
            if signed_in {
                coordinator.submit(CoordinatorCommand::SignInCompleted);
            }

            // Onboarding-window open logic (Issue #7, ADR-0018). Open the
            // onboarding surface only when the user is signed in (FSM in
            // Capturing per ADR-0009) and the bundled model is not yet on
            // disk. We intentionally don't open it pre-auth — onboarding
            // follows sign-in, never replaces it. FSM state is read via
            // the coordinator's snapshot() — refactor canonicalized this
            // path; StateHolder no longer exists. Models-root resolution,
            // disk probe, and failsafe direction live inside the helper.
            if let Some(window) = app.get_webview_window("settings") {
                if matches!(coordinator.snapshot(), CaptureState::SetupRequired) {
                    open_permission_setup_window(&window);
                } else if matches!(coordinator.snapshot(), CaptureState::Capturing)
                    && domains::summarization::service::bundled::bundled_model_needs_install()
                {
                    open_onboarding_window(&window);
                }
            }

            Ok(())
        });

    #[cfg(debug_assertions)]
    {
        builder = builder.invoke_handler(tauri::generate_handler![
            domains::menubar::ui::toggle_capture,
            domains::menubar::ui::open_settings,
            domains::menubar::ui::open_sign_in_surface,
            domains::menubar::ui::quit_app,
            domains::menubar::ui::simulate_error,
            domains::routing::runtime::commands::set_login_token,
            domains::routing::runtime::commands::clear_login_token,
            domains::routing::runtime::commands::get_connection_status,
            providers::permissions::commands::capture_permission_status,
            providers::permissions::commands::open_permission_pane,
            domains::summarization::runtime::commands::start_model_download,
        ]);
    }
    #[cfg(not(debug_assertions))]
    {
        builder = builder.invoke_handler(tauri::generate_handler![
            domains::menubar::ui::toggle_capture,
            domains::menubar::ui::open_settings,
            domains::menubar::ui::open_sign_in_surface,
            domains::menubar::ui::quit_app,
            domains::routing::runtime::commands::set_login_token,
            domains::routing::runtime::commands::clear_login_token,
            domains::routing::runtime::commands::get_connection_status,
            providers::permissions::commands::capture_permission_status,
            providers::permissions::commands::open_permission_pane,
            domains::summarization::runtime::commands::start_model_download,
        ]);
    }

    builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Intentive is a menu bar service. The tray icon is the anchor —
            // closing the Settings window must not quit the app. Only honor
            // an explicit exit (Quit menu item calls `app.exit(0)`, which
            // passes `Some(0)` here).
            if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                } else {
                    // Explicit Quit: tear down managed child processes before
                    // process termination so no orphan ScreenPipe/Ollama
                    // listeners remain after Intentive exits.
                    let supervisor = app.state::<Arc<ScreenpipeSupervisor>>().inner().clone();
                    let llm_slot = app.state::<Arc<LlmProviderSlot>>().inner().clone();
                    tauri::async_runtime::block_on(async move {
                        let _ = supervisor.stop().await;
                        *llm_slot.0.lock().await = None;
                    });
                }
            }
        });
}
