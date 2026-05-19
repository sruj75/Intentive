pub mod agent_interface;
pub mod capture_state;
pub mod llm_provider;
pub mod menu_bar;

use std::sync::Arc;

use capture_state::StubAuthChecker;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let stub = Arc::new(StubAuthChecker::new(false));
            menu_bar::install(app, stub)?;
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
