//! Menu bar shell — Tauri tray icon, menu construction, and command handlers.
//!
//! Depends on `capture_state` for the FSM. The state→menu and state→icon
//! mappings are pure (testable without a Tauri runtime); the runtime wiring
//! lives in `install`.

pub mod commands;
pub mod icon;
pub mod menu;
pub mod state_holder;

#[cfg(test)]
mod tests;

use std::sync::Arc;

use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{App, AppHandle, Manager, WindowEvent, Wry};

use crate::capture_state::{ErrorReason, StubAuthChecker};

use self::icon::path_for;
use self::menu::{describe, MenuItemDescriptor};
use self::state_holder::StateHolder;

pub const MENU_ID_SIGN_IN: &str = "intentive.sign_in";
pub const MENU_ID_TOGGLE: &str = "intentive.toggle_capture";
pub const MENU_ID_ERROR_INFO: &str = "intentive.error_info";
pub const MENU_ID_SETTINGS: &str = "intentive.open_settings";
pub const MENU_ID_QUIT: &str = "intentive.quit";

pub const TRAY_ID: &str = "intentive.tray";

#[derive(Debug, thiserror::Error)]
pub enum MenuBarError {
    #[error("tauri error: {0}")]
    Tauri(String),
}

impl From<tauri::Error> for MenuBarError {
    fn from(e: tauri::Error) -> Self {
        MenuBarError::Tauri(e.to_string())
    }
}

/// Install the menu bar shell: builds the tray icon, attaches the initial
/// menu, registers managed state, and wires menu events to the command
/// inners. The auth stub is held both as `Arc<dyn AuthChecker>` (inside
/// `StateHolder`) and as `Arc<StubAuthChecker>` (so the sign-in command
/// can flip it).
pub fn install(app: &mut App, stub_auth: Arc<StubAuthChecker>) -> Result<(), MenuBarError> {
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);

    let holder = Arc::new(StateHolder::new(stub_auth.clone()));
    app.manage(holder.clone());
    app.manage(stub_auth.clone());

    let initial_menu = build_menu(app.handle(), &holder)?;
    let initial_icon = load_icon(app.handle(), path_for(&holder.snapshot()))?;

    let app_handle = app.handle().clone();
    let holder_for_events = holder.clone();
    let stub_for_events = stub_auth.clone();

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(initial_icon)
        // Template mode strips color so macOS can recolor for light/dark
        // appearance. Disabled because the capturing/error variants encode
        // state via colored dots that must be preserved.
        .icon_as_template(false)
        .menu(&initial_menu)
        .on_menu_event(move |handle, event| {
            handle_menu_event(handle, &holder_for_events, &stub_for_events, event.id().0.as_str());
        })
        .build(&app_handle)?;

    // Closing the Settings window must hide it, not destroy it — the user
    // expects the menu bar service to keep running and to reopen Settings
    // on subsequent clicks.
    if let Some(settings) = app_handle.get_webview_window("settings") {
        let settings_for_close = settings.clone();
        settings.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = settings_for_close.hide();
            }
        });
    }

    Ok(())
}

fn handle_menu_event(
    app: &AppHandle,
    holder: &Arc<StateHolder>,
    stub: &Arc<StubAuthChecker>,
    id: &str,
) {
    match id {
        MENU_ID_SIGN_IN => {
            let _ = commands::open_sign_in_surface_inner(holder, stub);
            open_settings_window(app, true);
            refresh_tray(app, holder);
        }
        MENU_ID_TOGGLE => {
            let _ = commands::toggle_capture_inner(holder);
            refresh_tray(app, holder);
        }
        MENU_ID_SETTINGS => {
            let _ = commands::open_settings_inner(holder);
            open_settings_window(app, false);
        }
        MENU_ID_QUIT => {
            app.exit(0);
        }
        MENU_ID_ERROR_INFO => {
            // non-clickable in v1 — no-op.
        }
        _ => {}
    }
}

fn refresh_tray(app: &AppHandle, holder: &Arc<StateHolder>) {
    let snapshot = holder.snapshot();
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        if let Ok(icon) = load_icon(app, path_for(&snapshot)) {
            let _ = tray.set_icon(Some(icon));
        }
        if let Ok(new_menu) = build_menu(app, holder) {
            let _ = tray.set_menu(Some(new_menu));
        }
    }
}

fn open_settings_window(app: &AppHandle, sign_in_surface: bool) {
    if let Some(window) = app.get_webview_window("settings") {
        if sign_in_surface {
            let _ = window.eval("window.location.search = '?surface=sign-in';");
        } else {
            let _ = window.eval("window.location.search = '';");
        }
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn load_icon(app: &AppHandle, resource_relative: &str) -> Result<tauri::image::Image<'static>, MenuBarError> {
    let resolved = app
        .path()
        .resolve(resource_relative, tauri::path::BaseDirectory::Resource)
        .map_err(|e| MenuBarError::Tauri(e.to_string()))?;
    tauri::image::Image::from_path(resolved).map_err(MenuBarError::from)
}

fn build_menu(app: &AppHandle, holder: &Arc<StateHolder>) -> Result<Menu<Wry>, MenuBarError> {
    let descriptor = describe(&holder.snapshot());
    let mut builder = MenuBuilder::new(app);

    for (idx, item) in descriptor.items().iter().enumerate() {
        match item {
            MenuItemDescriptor::SignIn { enabled } => {
                let mi = MenuItemBuilder::with_id(MENU_ID_SIGN_IN, "Unauthenticated")
                    .enabled(*enabled)
                    .build(app)?;
                builder = builder.item(&mi);
            }
            MenuItemDescriptor::Toggle { label, enabled } => {
                let mi = MenuItemBuilder::with_id(MENU_ID_TOGGLE, *label)
                    .enabled(*enabled)
                    .build(app)?;
                builder = builder.item(&mi);
            }
            MenuItemDescriptor::ErrorInfo { text, enabled } => {
                let mi = MenuItemBuilder::with_id(MENU_ID_ERROR_INFO, text.as_str())
                    .enabled(*enabled)
                    .build(app)?;
                builder = builder.item(&mi);
            }
            MenuItemDescriptor::Settings { enabled } => {
                builder = builder.item(&PredefinedMenuItem::separator(app)?);
                let mi = MenuItemBuilder::with_id(MENU_ID_SETTINGS, "Open Settings…")
                    .enabled(*enabled)
                    .build(app)?;
                builder = builder.item(&mi);
            }
            MenuItemDescriptor::Quit { enabled } => {
                let mi = MenuItemBuilder::with_id(MENU_ID_QUIT, "Quit Intentive")
                    .accelerator("Cmd+Q")
                    .enabled(*enabled)
                    .build(app)?;
                builder = builder.item(&mi);
            }
        }
        let _ = idx;
    }

    builder.build().map_err(MenuBarError::from)
}

#[tauri::command]
pub fn toggle_capture(state: tauri::State<'_, Arc<StateHolder>>) -> Result<(), String> {
    commands::toggle_capture_inner(state.inner()).map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_settings(state: tauri::State<'_, Arc<StateHolder>>) {
    let _ = commands::open_settings_inner(state.inner());
}

#[tauri::command]
pub fn open_sign_in_surface(
    holder: tauri::State<'_, Arc<StateHolder>>,
    stub: tauri::State<'_, Arc<StubAuthChecker>>,
) {
    let _ = commands::open_sign_in_surface_inner(holder.inner(), stub.inner());
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[cfg(debug_assertions)]
#[tauri::command]
pub fn simulate_error(state: tauri::State<'_, Arc<StateHolder>>, app: AppHandle) {
    if let Ok(reason) = ErrorReason::new("Simulated error for smoke test".to_string()) {
        state.inner().to_error(reason);
        refresh_tray(&app, state.inner());
    }
}

