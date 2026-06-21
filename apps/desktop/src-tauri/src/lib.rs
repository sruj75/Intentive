pub mod domains;
pub mod providers;

use std::sync::Arc;

use async_trait::async_trait;
use tauri::path::BaseDirectory;
use tauri::Emitter;
use tauri::Manager;
use tauri::WebviewWindow;
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
    RoutingSource, TryEmitError, TungsteniteTransport, WsSession,
};
use domains::routing::types::{ConnectionStatus, RoutingState, SessionState};
use domains::snapshots::repo::SnapshotStore;
use domains::snapshots::runtime::agent_interface::{AgentSink, PushError};
use domains::snapshots::runtime::heartbeat::{
    ContextHeartbeat, ReqwestActivityClient, ScreenpipeUrlSource, Summarizer, SummarizerError,
};
use domains::snapshots::types::{ContextSnapshot, SessionEndMarker, SessionEndReason};
use domains::summarization::config::ProviderConfig;
use domains::summarization::runtime::{
    LazyLlmProvider, LiveProviderResolver, LlmProviderSlot, SummarizeError,
};
use domains::updates::runtime::{TauriUpdateChannel, UpdateCoordinator};
use domains::updates::types::UpdateChannel;
use providers::permissions::status_emitter::PermissionEmitterSupervisor;
use providers::permissions::{CapturePermissions, MacosCapturePermissions};
use tokio::sync::mpsc;

/// Cross-domain bridge: implements the snapshots `Summarizer` trait by
/// delegating to the summarization domain's [`LazyLlmProvider`]. The
/// resolve-once-and-cache *behavior* lives in `summarization::runtime`; only
/// this thin trait bridge stays in the composition root (the rust-architecture
/// linter allows the cross-domain `Summarizer` impl only here). It maps the
/// domain's `SummarizeError` onto the heartbeat's `SummarizerError` arms.
struct LlmProviderSlotSummarizer {
    lazy: LazyLlmProvider,
}

#[async_trait]
impl Summarizer for LlmProviderSlotSummarizer {
    async fn prepare(&self) {
        self.lazy.prepare().await;
    }

    async fn summarize(&self, activity: &str) -> Result<String, SummarizerError> {
        self.lazy.summarize(activity).await.map_err(|e| match e {
            SummarizeError::Unresolved => SummarizerError::Unresolved,
            SummarizeError::Provider(pe) => SummarizerError::Failed(pe.to_string()),
        })
    }
}

/// Dev-only deterministic summarizer (#35). When `INTENTIVE_SMOKE_STUB_SUMMARIZER=1`
/// the smoke harness swaps this in for the on-device LLM so heartbeat ticks
/// never skip on "provider not resolved" — keeping the run fast, repeatable, and
/// AFK. ScreenPipe is still real; only the summary text is stubbed. Compiled
/// only under `debug_assertions`.
#[cfg(debug_assertions)]
struct SmokeStubSummarizer;

#[cfg(debug_assertions)]
#[async_trait]
impl Summarizer for SmokeStubSummarizer {
    async fn summarize(&self, _activity: &str) -> Result<String, SummarizerError> {
        Ok("Smoke session summary (deterministic stub).".to_string())
    }
}

/// Dev-only FSM state tracer (#35). Subscribed to the coordinator so every
/// shell-state transition lands in the structured smoke log as ordering
/// evidence. Compiled only under `debug_assertions`.
#[cfg(debug_assertions)]
struct SmokeStateObserver;

#[cfg(debug_assertions)]
impl domains::capture::types::session::StateObserver for SmokeStateObserver {
    fn on_state(&self, state: &CaptureState) {
        providers::smoke::smoke_event(
            "fsm_state",
            serde_json::json!({ "state": format!("{state:?}") }),
        );
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

    /// #34 end-marker ordering guarantee. `ContextHeartbeat::stop` sequences
    /// stop tick loop → (drain final snapshot) → emit Session End Marker before
    /// it returns (pinned by `heartbeat::tests::stop_emits_one_session_end_marker`
    /// and `stop_emits_marker_even_with_zero_ticks`). Capture-session teardown
    /// (`coordinator::apply` → `StopSession`/`EndSession`) calls this hook and
    /// never disconnects Routing — the `WsSession` is torn down only by the
    /// independent sign-out path (`clear_login_token`). So the marker always
    /// leaves on a still-open socket, best-effort like snapshots (ADR-0005; #38
    /// self-corrects any stale liveness).
    ///
    /// #35 sharpened the `StopSession` path so the coordinator runs this hook
    /// *before* `supervisor.stop()` — the marker now provably leaves the process
    /// before ScreenPipe exits (the marker needs neither ScreenPipe nor a fresh
    /// tick). See ADR-0022.
    async fn on_session_end(&self, reason: SessionEndReason) {
        self.0.clone().stop(reason).await;
    }
}

/// Cross-domain bridge (installed in #34): implements the snapshots `AgentSink`
/// by framing Context Snapshots / Session End Markers as Protocol events and
/// pushing them through the routing `WsSession`'s `try_emit` seam, mapping
/// routing's `TryEmitError` onto the snapshots `PushError`. It lives at the
/// composition root because it names two domains' runtime types, which the
/// layer rule allows only here. `NoopAgentSink` remains the inert default for
/// any wiring that runs without a live session.
struct WsSessionAgentSink {
    session: Arc<WsSession>,
}

/// Frame a Context Snapshot as the `context_snapshot` Protocol event. The Rust
/// `ContextSnapshot` already serializes the frozen v1 fields (`snapshot_id`,
/// `captured_at`, `period_start`, `period_end`, `summary`); this only adds the
/// event `type` tag from `packages/protocol`.
fn context_snapshot_frame(snapshot: &ContextSnapshot) -> String {
    let mut value = serde_json::to_value(snapshot).expect("ContextSnapshot serializes");
    value["type"] = serde_json::Value::String("context_snapshot".to_string());
    value.to_string()
}

/// Frame a Session End Marker as the distinct `session_end_marker` event
/// (canonical `ended_at` + `reason`; invariant 7).
fn session_end_marker_frame(marker: &SessionEndMarker) -> String {
    let mut value = serde_json::to_value(marker).expect("SessionEndMarker serializes");
    value["type"] = serde_json::Value::String("session_end_marker".to_string());
    value.to_string()
}

#[async_trait]
impl AgentSink for WsSessionAgentSink {
    async fn emit_context_snapshot(&self, snapshot: &ContextSnapshot) -> Result<(), PushError> {
        // Dev-only smoke evidence (#35): one line per heartbeat tick, keyed by
        // snapshot_id so `assert.mjs` can correlate store rows ↔ gateway receipts.
        #[cfg(debug_assertions)]
        providers::smoke::smoke_event(
            "snapshot_emit",
            serde_json::json!({ "snapshot_id": snapshot.snapshot_id.to_string() }),
        );
        self.session
            .try_emit(context_snapshot_frame(snapshot))
            .await
            // The only TryEmitError is NotConnected → the socket is down.
            .map_err(|_| PushError::NotConnected)
    }

    async fn emit_session_end_marker(&self, marker: &SessionEndMarker) {
        // Dev-only smoke evidence (#35): this line's timestamp must precede the
        // supervisor's `screenpipe_exited` line (ADR-0022 stop ordering).
        #[cfg(debug_assertions)]
        providers::smoke::smoke_event(
            "marker_emit",
            serde_json::json!({ "reason": format!("{:?}", marker.reason) }),
        );
        if let Err(err) = self
            .session
            .try_emit(session_end_marker_frame(marker))
            .await
        {
            if should_capture_try_emit_error(&err) {
                providers::observability::capture_error(&err);
            }
        }
    }
}

fn should_capture_try_emit_error(error: &TryEmitError) -> bool {
    !matches!(error, TryEmitError::NotConnected)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _sentry = providers::observability::init();
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // The ScreenPipe Supervisor owns the child process; the Capture
            // Session coordinator owns the shell-state FSM and orchestrates
            // start/stop. The supervisor publishes outcomes on its events
            // channel, which the coordinator drains.
            let binary_path = app.path().resolve(
                domains::capture::config::CAPTURE_HELPER_RESOURCE_PATH,
                BaseDirectory::Resource,
            )?;
            let spawner: Arc<dyn Spawner> = Arc::new(OsSpawner);
            let (events_tx, events_rx) = mpsc::unbounded_channel();
            let supervisor = ScreenpipeSupervisor::new(binary_path, spawner, events_tx);

            let auth = StubAuthChecker::new(false);
            let signed_in = auth.is_signed_in();
            let permissions = Arc::new(MacosCapturePermissions);
            app.manage(permissions.clone() as Arc<dyn CapturePermissions>);
            app.manage(PermissionEmitterSupervisor::default());
            let coordinator: Arc<CaptureSessionCoordinator> = CaptureSessionCoordinator::new(
                supervisor.clone() as Arc<dyn Supervisor>,
                events_rx,
                &auth,
                permissions.clone() as Arc<dyn ReadinessChecker>,
            );
            app.manage(coordinator.clone() as Arc<dyn CaptureSessionControl>);
            app.manage(supervisor.clone());

            // Dev-only smoke FSM tracer (#35). Subscribed before `run()` is
            // spawned so it records the very first transition (the signed-in
            // auto-start). Absent from release builds.
            #[cfg(debug_assertions)]
            coordinator.subscribe(Arc::new(SmokeStateObserver));

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
            tauri::async_runtime::spawn(
                PermissionMonitor::new(
                    permissions.clone() as Arc<dyn ReadinessChecker>,
                    coordinator.clone() as Arc<dyn CaptureSessionControl>,
                )
                .run(),
            );

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
            let llm_slot = Arc::new(LlmProviderSlot::empty());
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
            app.manage(routing_session.clone());

            // Dev-only login-token injection (#35). Lets the AFK smoke harness
            // drive the *real* `GET /agent` → Protocol handshake without
            // scripting the webview sign-in. Empty/whitespace reads as unset
            // (see `smoke::dev_env`), and the whole block is absent from release
            // builds — the only sanctioned reason it stays AFK. See ADR-0022.
            #[cfg(debug_assertions)]
            if let Some(token) = providers::smoke::dev_env(providers::smoke::LOGIN_TOKEN_ENV) {
                eprintln!(
                    "⚠️  SMOKE: {} set — injecting a login token at startup (dev-only)",
                    providers::smoke::LOGIN_TOKEN_ENV
                );
                let session = routing_session.clone();
                tauri::async_runtime::spawn(async move {
                    session.set_login_token(token).await;
                });
            }

            let _ = app.emit(
                "routing:status",
                ConnectionStatus {
                    mood: domains::routing::types::ConnectionMood::SignedOut,
                },
            );

            // Context Heartbeat (Issue #8, ADR-0008). #34 plugs the live bridge
            // in: the heartbeat now frames Context Snapshots / Session End
            // Markers and pushes them through the routing `WsSession`. A push
            // that lands while the socket is down leaves `pushed_at = NULL`
            // (ADR-0005: fire-and-forget, at-most-once — no ack, no retry).
            // `NoopAgentSink` remains the documented inert default for any wiring
            // that must run without a live session.
            let snapshot_store_arc: Arc<SnapshotStore> =
                app.state::<Arc<SnapshotStore>>().inner().clone();
            let http = reqwest::Client::new();
            let agent_sink: Arc<dyn AgentSink> = Arc::new(WsSessionAgentSink {
                session: routing_session.clone(),
            });
            let resolver = Arc::new(LiveProviderResolver::new(
                provider_config,
                http.clone(),
                Arc::new({
                    let endpoint = screenpipe_endpoint.clone();
                    move || endpoint.current_or_primary_url()
                }),
            ));
            let real_summarizer = Arc::new(LlmProviderSlotSummarizer {
                lazy: LazyLlmProvider::new(llm_slot.clone(), resolver),
            });
            // Dev-only: the deterministic stub (#35) keeps the smoke AFK by never
            // skipping a tick on an unresolved provider. Release always uses the
            // real on-device LLM.
            let summarizer: Arc<dyn Summarizer> = {
                #[cfg(debug_assertions)]
                {
                    if providers::smoke::dev_env(providers::smoke::STUB_SUMMARIZER_ENV).as_deref()
                        == Some("1")
                    {
                        eprintln!(
                            "⚠️  SMOKE: {}=1 — using the deterministic stub summarizer (dev-only)",
                            providers::smoke::STUB_SUMMARIZER_ENV
                        );
                        Arc::new(SmokeStubSummarizer) as Arc<dyn Summarizer>
                    } else {
                        real_summarizer as Arc<dyn Summarizer>
                    }
                }
                #[cfg(not(debug_assertions))]
                {
                    real_summarizer as Arc<dyn Summarizer>
                }
            };
            let activity_client = Arc::new(ReqwestActivityClient::new(http));
            let screenpipe_url_source =
                Arc::new(screenpipe_endpoint) as Arc<dyn ScreenpipeUrlSource>;
            // Dev-only: a compressed heartbeat cadence (#35) lets the smoke finish
            // in ~2 short cycles. Release compiles only the 600s `::new` path so a
            // 30-second heartbeat can never ship.
            let heartbeat = {
                #[cfg(debug_assertions)]
                {
                    match providers::smoke::dev_env(providers::smoke::HEARTBEAT_INTERVAL_ENV)
                        .and_then(|raw| raw.parse::<u64>().ok())
                        .filter(|secs| *secs > 0)
                    {
                        Some(secs) => {
                            eprintln!(
                                "⚠️  SMOKE: {}={secs} — non-default heartbeat cadence (dev-only)",
                                providers::smoke::HEARTBEAT_INTERVAL_ENV
                            );
                            ContextHeartbeat::with_interval(
                                summarizer,
                                activity_client,
                                screenpipe_url_source,
                                snapshot_store_arc,
                                agent_sink,
                                std::time::Duration::from_secs(secs),
                            )
                        }
                        None => ContextHeartbeat::new(
                            summarizer,
                            activity_client,
                            screenpipe_url_source,
                            snapshot_store_arc,
                            agent_sink,
                        ),
                    }
                }
                #[cfg(not(debug_assertions))]
                {
                    ContextHeartbeat::new(
                        summarizer,
                        activity_client,
                        screenpipe_url_source,
                        snapshot_store_arc,
                        agent_sink,
                    )
                }
            };
            coordinator.set_heartbeat(Arc::new(HeartbeatHooks(heartbeat)));

            // Signed-in launch auto-starts a Capture Session per ADR-0009.
            // Install orchestration collaborators first so startup cannot
            // begin capture without a corresponding Context Heartbeat.
            if signed_in {
                coordinator.submit(CoordinatorCommand::SignInCompleted);
            }

            // Dev-only (#35): the AFK smoke needs capture to auto-start, but the
            // login-token injection above only moves *Routing* to signed-in —
            // `set_login_token` does not flip the capture FSM (Routing State and
            // capture sign-in are independent; see CONTEXT.md). Mirror the
            // menu-bar sign-in surface here so the harness doesn't have to drive
            // the tray. Keyed off its own env (not the login token) because
            // fixture fast-loop mode has no token. Submitted *after* the
            // heartbeat is wired (above), exactly as the `signed_in` branch
            // requires, so the StartSession effect has a Context Heartbeat.
            #[cfg(debug_assertions)]
            if !signed_in
                && providers::smoke::dev_env(providers::smoke::CAPTURE_SIGNED_IN_ENV).as_deref()
                    == Some("1")
            {
                eprintln!(
                    "⚠️  SMOKE: {}=1 — driving the capture FSM to signed-in at startup (dev-only)",
                    providers::smoke::CAPTURE_SIGNED_IN_ENV
                );
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
            if matches!(coordinator.snapshot(), CaptureState::SetupRequired) {
                domains::menubar::ui::open_permission_setup_window(app.handle());
            } else if matches!(coordinator.snapshot(), CaptureState::Capturing)
                && domains::summarization::service::bundled::bundled_model_needs_install()
            {
                if let Some(window) = app.get_webview_window("settings") {
                    open_onboarding_window(&window);
                }
            }

            // Silent in-app auto-update (ADR-0024). The coordinator owns the
            // check→download→install pass behind the `UpdateChannel` seam; here
            // we hand it the real Tauri-backed channel, fire one check on
            // launch, and (on macOS) register the wake-from-sleep trigger so
            // long-lived suspended installs still update. No UI: updates apply
            // on the next launch with no prompt.
            let update_coordinator = Arc::new(UpdateCoordinator::new(Arc::new(
                TauriUpdateChannel::new(app.handle().clone()),
            )
                as Arc<dyn UpdateChannel>));
            tauri::async_runtime::spawn({
                let update_coordinator = update_coordinator.clone();
                async move { update_coordinator.trigger().await }
            });
            #[cfg(target_os = "macos")]
            domains::updates::runtime::register_wake_trigger(update_coordinator.clone());

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

#[cfg(test)]
mod tests {
    use super::{
        context_snapshot_frame, session_end_marker_frame, should_capture_try_emit_error,
        WsSessionAgentSink,
    };
    use crate::domains::routing::runtime::{
        DisabledRoutingSource, FastrandJitter, NoopRoutingObserver, TryEmitError,
        TungsteniteTransport, WsSession,
    };
    use crate::domains::snapshots::runtime::agent_interface::{AgentSink, PushError};
    use crate::domains::snapshots::types::{ContextSnapshot, SessionEndMarker, SessionEndReason};
    use chrono::{TimeZone, Utc};
    use serde_json::{json, Value};
    use std::sync::Arc;
    use uuid::Uuid;

    #[test]
    fn not_connected_marker_emit_failures_are_expected_not_sentry_errors() {
        assert!(!should_capture_try_emit_error(&TryEmitError::NotConnected));
    }

    #[test]
    fn context_snapshot_frame_carries_only_the_frozen_v1_fields() {
        let captured_at = Utc.timestamp_opt(1_700_000_000, 0).single().unwrap();
        let period_start = Utc.timestamp_opt(1_699_999_400, 0).single().unwrap();
        let snapshot = ContextSnapshot {
            snapshot_id: Uuid::nil(),
            captured_at,
            period_start,
            period_end: captured_at,
            summary: "did some things".to_string(),
        };

        let frame: Value = serde_json::from_str(&context_snapshot_frame(&snapshot)).unwrap();
        let object = frame.as_object().expect("frame is a JSON object");

        assert_eq!(frame["type"], json!("context_snapshot"));
        assert_eq!(frame["snapshot_id"], json!(Uuid::nil().to_string()));
        assert_eq!(frame["summary"], json!("did some things"));
        // Datetimes pass through the struct's own serialization unchanged.
        assert_eq!(
            frame["captured_at"],
            serde_json::to_value(captured_at).unwrap()
        );
        assert_eq!(
            frame["period_start"],
            serde_json::to_value(period_start).unwrap()
        );
        assert_eq!(
            frame["period_end"],
            serde_json::to_value(captured_at).unwrap()
        );
        // Invariant 6: no fields beyond `type` + the five frozen payload fields.
        assert_eq!(
            object.len(),
            6,
            "context_snapshot must not smuggle extra fields: {object:?}"
        );
    }

    /// The canonical Context Snapshot sample shared by the Rust golden test and
    /// the committed `fixtures/context_snapshot.json`. Fixed values (nil UUID,
    /// whole-second timestamps) keep the fixture stable across runs.
    fn canonical_context_snapshot() -> ContextSnapshot {
        ContextSnapshot {
            snapshot_id: Uuid::nil(),
            captured_at: Utc.timestamp_opt(1_700_000_000, 0).single().unwrap(),
            period_start: Utc.timestamp_opt(1_699_999_400, 0).single().unwrap(),
            period_end: Utc.timestamp_opt(1_700_000_000, 0).single().unwrap(),
            summary: "Reviewed a pull request and replied to two messages.".to_string(),
        }
    }

    /// The Rust serializer must reproduce the committed golden fixture that the
    /// Desktop Vitest suite feeds through the live `@intentive/protocol` Zod
    /// parser. Comparing as `serde_json::Value` (not byte string) makes the lock
    /// about shape, not key order or whitespace. This is the Rust end of the
    /// Rust ⟷ fixture ⟷ live-contract chain that guards the ack-less sender.
    #[test]
    fn context_snapshot_frame_matches_the_committed_golden_fixture() {
        let fixture: Value =
            serde_json::from_str(include_str!("../fixtures/context_snapshot.json")).unwrap();
        let frame: Value =
            serde_json::from_str(&context_snapshot_frame(&canonical_context_snapshot())).unwrap();
        assert_eq!(
            frame, fixture,
            "context_snapshot frame drifted from fixtures/context_snapshot.json"
        );
    }

    #[test]
    fn session_end_marker_frame_is_its_own_event_with_canonical_fields() {
        let ended_at = Utc.timestamp_opt(1_700_000_500, 0).single().unwrap();
        let marker = SessionEndMarker {
            ended_at,
            reason: SessionEndReason::Quit,
        };

        let frame: Value = serde_json::from_str(&session_end_marker_frame(&marker)).unwrap();
        let object = frame.as_object().expect("frame is a JSON object");

        assert_eq!(frame["type"], json!("session_end_marker"));
        assert_eq!(frame["ended_at"], serde_json::to_value(ended_at).unwrap());
        // Reason serializes snake_case to match the protocol enum.
        assert_eq!(frame["reason"], json!("quit"));
        // Invariant 7: a distinct event of exactly `type` + `ended_at` + `reason`.
        assert_eq!(object.len(), 3, "session_end_marker fields: {object:?}");
    }

    /// Mirror of the Context Snapshot golden test for the end marker. Uses the
    /// `user_toggle` reason — the fixture variant the Vitest suite parses — so
    /// the snake_case enum serialization is locked from the Rust side too.
    #[test]
    fn session_end_marker_frame_matches_the_committed_golden_fixture() {
        let marker = SessionEndMarker {
            ended_at: Utc.timestamp_opt(1_700_000_000, 0).single().unwrap(),
            reason: SessionEndReason::UserToggle,
        };
        let fixture: Value =
            serde_json::from_str(include_str!("../fixtures/session_end_marker.json")).unwrap();
        let frame: Value = serde_json::from_str(&session_end_marker_frame(&marker)).unwrap();
        assert_eq!(
            frame, fixture,
            "session_end_marker frame drifted from fixtures/session_end_marker.json"
        );
    }

    /// Build a `WsSession` with no live connection. Its `outbound` seam is
    /// `None`, so `try_emit` (and thus the bridge) reports `NotConnected` until
    /// a test installs a live channel.
    fn disconnected_session() -> Arc<WsSession> {
        WsSession::new(
            Arc::new(DisabledRoutingSource),
            Arc::new(TungsteniteTransport),
            Arc::new(NoopRoutingObserver),
            Arc::new(FastrandJitter),
        )
    }

    /// The live half of the #34 bridge: with the routing session's outbound seam
    /// up, `emit_context_snapshot` returns `Ok` and the framed JSON lands on the
    /// channel; with it absent it returns `Err(PushError::NotConnected)`. The end
    /// marker rides the same seam (best-effort, no result).
    #[tokio::test]
    async fn ws_session_agent_sink_emits_through_the_live_session_and_reports_disconnect() {
        let session = disconnected_session();
        let sink = WsSessionAgentSink {
            session: session.clone(),
        };

        // No connection yet → the bridge maps `TryEmitError::NotConnected`.
        let err = sink
            .emit_context_snapshot(&canonical_context_snapshot())
            .await
            .expect_err("a down socket must report NotConnected");
        assert!(matches!(err, PushError::NotConnected), "got {err:?}");

        // Install a live outbound seam; the framed snapshot now reaches the wire.
        let mut outbound = session.install_test_outbound().await;
        sink.emit_context_snapshot(&canonical_context_snapshot())
            .await
            .expect("a live socket accepts the snapshot frame");
        let frame: Value =
            serde_json::from_str(&outbound.try_recv().expect("snapshot frame on the channel"))
                .unwrap();
        assert_eq!(frame["type"], json!("context_snapshot"));
        assert_eq!(frame["snapshot_id"], json!(Uuid::nil().to_string()));

        // The end marker is best-effort and rides the same seam.
        let marker = SessionEndMarker {
            ended_at: Utc.timestamp_opt(1_700_000_000, 0).single().unwrap(),
            reason: SessionEndReason::UserToggle,
        };
        sink.emit_session_end_marker(&marker).await;
        let marker_frame: Value =
            serde_json::from_str(&outbound.try_recv().expect("marker frame on the channel"))
                .unwrap();
        assert_eq!(marker_frame["type"], json!("session_end_marker"));
        assert_eq!(marker_frame["reason"], json!("user_toggle"));
    }
}
