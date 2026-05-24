pub mod agent_interface;
pub mod capture_session;
pub mod capture_state;
pub mod llm_provider;
pub mod menu_bar;
pub mod port;
pub mod screenpipe_supervisor;
pub mod snapshot;
pub mod snapshot_store;

use std::sync::Arc;

use tauri::path::BaseDirectory;
use tauri::Manager;
use tauri::WebviewWindow;
use tokio::sync::Mutex;

use capture_session::{CaptureSessionCoordinator, CoordinatorCommand};
use capture_state::{AuthChecker, CaptureState, StubAuthChecker};
use llm_provider::{LlmProvider, ProviderConfig};
use screenpipe_supervisor::{OsSpawner, ScreenpipeSupervisor, Spawner, Supervisor};
use snapshot_store::SnapshotStore;
use tokio::sync::mpsc;

/// Tauri-managed state for the resolved on-device LLM Provider. Starts as
/// `None` and is populated by the `start_model_download` command (Slice 9)
/// after a successful Tier 3 prepare. The Context Heartbeat will eventually
/// read this at tick time to summarize activity windows.
pub struct LlmProviderSlot(pub Mutex<Option<Arc<LlmProvider>>>);

/// Tauri-managed state for the `ProviderConfig` resolved at startup. The
/// command path reads this to drive `LlmProvider::resolve_with_progress`.
pub struct ProviderConfigState(pub ProviderConfig);

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
            let coordinator: Arc<CaptureSessionCoordinator> = CaptureSessionCoordinator::new(
                supervisor.clone() as Arc<dyn Supervisor>,
                events_rx,
                &auth,
            );
            app.manage(coordinator.clone());
            app.manage(supervisor);

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

            menu_bar::install(app, coordinator.clone())?;

            // Signed-in launch auto-starts a Capture Session per ADR-0009.
            if signed_in {
                coordinator.submit(CoordinatorCommand::SignInCompleted);
            }

            // LLM Provider wiring (Issue #7, ADR-0006, ADR-0018). The slot
            // starts empty — Tier 3 may need a model download that drives
            // through the `start_model_download` command. The Context
            // Heartbeat reads this at tick time; if `None`, skips the tick.
            let bundled_ollama_binary = app
                .path()
                .resolve("resources/ollama", BaseDirectory::Resource)?;
            let provider_config = ProviderConfig {
                bundled_ollama_binary,
                ..ProviderConfig::default()
            };
            app.manage(ProviderConfigState(provider_config));
            app.manage(LlmProviderSlot(Mutex::new(None)));

            // Onboarding-window open logic (Issue #7, ADR-0018). Open the
            // onboarding surface only when the user is signed in (FSM in
            // Capturing per ADR-0009) and the bundled model is not yet on
            // disk. We intentionally don't open it pre-auth — onboarding
            // follows sign-in, never replaces it. FSM state is read via
            // the coordinator's snapshot() — refactor canonicalized this
            // path; StateHolder no longer exists. Models-root resolution,
            // disk probe, and failsafe direction live inside the helper.
            let needs_onboarding = matches!(coordinator.snapshot(), CaptureState::Capturing)
                && llm_provider::bundled::bundled_model_needs_install();
            if needs_onboarding {
                if let Some(window) = app.get_webview_window("settings") {
                    open_onboarding_window(&window);
                }
            }

            Ok(())
        });

    #[cfg(debug_assertions)]
    {
        builder = builder.invoke_handler(tauri::generate_handler![
            menu_bar::toggle_capture,
            menu_bar::open_settings,
            menu_bar::open_sign_in_surface,
            menu_bar::quit_app,
            menu_bar::simulate_error,
            llm_provider::commands::start_model_download,
        ]);
    }
    #[cfg(not(debug_assertions))]
    {
        builder = builder.invoke_handler(tauri::generate_handler![
            menu_bar::toggle_capture,
            menu_bar::open_settings,
            menu_bar::open_sign_in_surface,
            menu_bar::quit_app,
            llm_provider::commands::start_model_download,
        ]);
    }

    builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            // Intentive is a menu bar service. The tray icon is the anchor —
            // closing the Settings window must not quit the app. Only honor
            // an explicit exit (Quit menu item calls `app.exit(0)`, which
            // passes `Some(0)` here).
            if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}
