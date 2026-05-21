pub mod agent_interface;
pub mod capture_session;
pub mod capture_state;
pub mod llm_provider;
pub mod menu_bar;
pub mod screenpipe_supervisor;

use std::sync::Arc;

use tauri::path::BaseDirectory;
use tauri::Manager;

use capture_session::{CaptureSessionCoordinator, CoordinatorCommand};
use capture_state::{AuthChecker, StubAuthChecker};
use screenpipe_supervisor::{OsSpawner, ScreenpipeSupervisor, Spawner, Supervisor};
use tokio::sync::mpsc;

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

            tauri::async_runtime::spawn(coordinator.clone().run());

            menu_bar::install(app, coordinator.clone())?;

            // Signed-in launch auto-starts a Capture Session per ADR-0009.
            if signed_in {
                coordinator.submit(CoordinatorCommand::SignInCompleted);
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
        ]);
    }
    #[cfg(not(debug_assertions))]
    {
        builder = builder.invoke_handler(tauri::generate_handler![
            menu_bar::toggle_capture,
            menu_bar::open_settings,
            menu_bar::open_sign_in_surface,
            menu_bar::quit_app,
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
