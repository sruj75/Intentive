pub mod agent_interface;
pub mod capture_session;
pub mod capture_state;
pub mod llm_provider;
pub mod menu_bar;

use std::sync::Arc;

use tauri::path::BaseDirectory;
use tauri::Manager;

use capture_session::{CaptureSessionManager, OsSpawner, Spawner};
use capture_state::{CaptureState, StubAuthChecker};
use menu_bar::state_holder::StateHolder;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let stub = Arc::new(StubAuthChecker::new(false));
            menu_bar::install(app, stub)?;

            // The Capture Session manager owns the ScreenPipe child process
            // (Issue #5). Wired here so the menu event handler can dispatch
            // start/stop on toggle and the watcher can refresh the tray when
            // it transitions the FSM from inside its async task.
            let holder = app.state::<Arc<StateHolder>>().inner().clone();
            let binary_path = app
                .path()
                .resolve("resources/screenpipe", BaseDirectory::Resource)?;
            let spawner: Arc<dyn Spawner> = Arc::new(OsSpawner);
            let app_handle = app.handle().clone();
            let holder_for_refresh = holder.clone();
            let refresh: Arc<dyn Fn() + Send + Sync> = Arc::new(move || {
                menu_bar::refresh_tray(&app_handle, &holder_for_refresh);
            });
            let manager = CaptureSessionManager::new(binary_path, spawner, holder.clone(), refresh);
            app.manage(manager.clone());

            // Signed-in launch lands the FSM in Capturing per ADR-0009; kick
            // off the Capture Session immediately so the user doesn't have
            // to toggle on every relaunch.
            if matches!(holder.snapshot(), CaptureState::Capturing) {
                tauri::async_runtime::spawn(async move {
                    let _ = manager.start().await;
                });
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
