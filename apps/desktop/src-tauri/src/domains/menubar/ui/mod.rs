//! Menu bar shell — Tauri tray icon, menu construction, and command handlers.
//!
//! Publishes domain commands to the Capture Session coordinator and renders
//! state-change notifications from a single observer. The FSM is no longer
//! visible at this layer.

use std::sync::Arc;

use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{App, AppHandle, Manager, WindowEvent, Wry};

use crate::domains::capture::types::session::{
    CaptureSessionControl, CoordinatorCommand, StateObserver,
};
use crate::domains::capture::types::state::CaptureState;
#[cfg(debug_assertions)]
use crate::domains::capture::types::state::ErrorReason;
use crate::domains::menubar::service::icon::path_for;
use crate::domains::menubar::service::menu::{describe, MenuItemDescriptor};

/// Whether macOS should treat the tray icon as a template image (auto-tint
/// for light/dark mode). Template mode strips color, so the capturing/error
/// variants — whose colored dots encode state — opt out.
fn icon_is_template(state: &CaptureState) -> bool {
    matches!(
        state,
        CaptureState::Unauthenticated | CaptureState::SetupRequired | CaptureState::Stopped
    )
}

pub const MENU_ID_SIGN_IN: &str = "intentive.sign_in";
pub const MENU_ID_FINISH_SETUP: &str = "intentive.finish_setup";
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

/// Tray observer — subscribed once by `install`. Receives every state-change
/// notification from the coordinator and re-renders the menu bar icon + menu.
struct TrayObserver {
    app: AppHandle,
}

impl StateObserver for TrayObserver {
    fn on_state(&self, state: &CaptureState) {
        refresh_tray(&self.app, state);
    }
}

/// Install the menu bar shell: build the tray icon and menu for the
/// coordinator's initial state, then subscribe a `TrayObserver` so future
/// transitions land on the menu bar without any caller-side choreography.
pub fn install(
    app: &mut App,
    coordinator: Arc<dyn CaptureSessionControl>,
) -> Result<(), MenuBarError> {
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);

    let initial_state = coordinator.snapshot();
    let initial_menu = build_menu(app.handle(), &initial_state)?;
    let initial_icon = load_icon(app.handle(), path_for(&initial_state))?;

    let app_handle = app.handle().clone();
    let coord_for_events = coordinator.clone();

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(initial_icon)
        .icon_as_template(icon_is_template(&initial_state))
        .menu(&initial_menu)
        .on_menu_event(move |handle, event| {
            handle_menu_event(handle, &coord_for_events, event.id().0.as_str());
        })
        .build(&app_handle)?;

    coordinator.subscribe(Arc::new(TrayObserver {
        app: app_handle.clone(),
    }));

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

fn handle_menu_event(app: &AppHandle, coordinator: &Arc<dyn CaptureSessionControl>, id: &str) {
    match id {
        MENU_ID_SIGN_IN => {
            coordinator.submit(CoordinatorCommand::SignInCompleted);
            open_settings_window(app, true);
        }
        MENU_ID_FINISH_SETUP => {
            open_permission_setup_window(app);
        }
        MENU_ID_TOGGLE => {
            coordinator.submit(CoordinatorCommand::ToggleRequested);
        }
        MENU_ID_SETTINGS => {
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

pub(crate) fn open_permission_setup_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.eval("window.location.search = '?surface=permission-setup';");
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub(crate) fn refresh_tray(app: &AppHandle, state: &CaptureState) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        if let Ok(icon) = load_icon(app, path_for(state)) {
            let _ = tray.set_icon(Some(icon));
            let _ = tray.set_icon_as_template(icon_is_template(state));
        }
        if let Ok(new_menu) = build_menu(app, state) {
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

fn load_icon(
    app: &AppHandle,
    resource_relative: &str,
) -> Result<tauri::image::Image<'static>, MenuBarError> {
    let resolved = app
        .path()
        .resolve(resource_relative, tauri::path::BaseDirectory::Resource)
        .map_err(|e| MenuBarError::Tauri(e.to_string()))?;
    tauri::image::Image::from_path(resolved).map_err(MenuBarError::from)
}

fn build_menu(app: &AppHandle, state: &CaptureState) -> Result<Menu<Wry>, MenuBarError> {
    let descriptor = describe(state);
    let mut builder = MenuBuilder::new(app);

    for item in descriptor.items() {
        match item {
            MenuItemDescriptor::SignIn { enabled } => {
                let mi = MenuItemBuilder::with_id(MENU_ID_SIGN_IN, "Unauthenticated")
                    .enabled(*enabled)
                    .build(app)?;
                builder = builder.item(&mi);
            }
            MenuItemDescriptor::FinishSetup { enabled } => {
                let mi = MenuItemBuilder::with_id(MENU_ID_FINISH_SETUP, "Finish Setup…")
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
    }

    builder.build().map_err(MenuBarError::from)
}

#[tauri::command]
pub fn toggle_capture(coordinator: tauri::State<'_, Arc<dyn CaptureSessionControl>>) {
    coordinator
        .inner()
        .submit(CoordinatorCommand::ToggleRequested);
}

#[tauri::command]
pub fn open_settings() {
    // Window plumbing is handled by the menu event handler; this command
    // exists for the frontend invoke surface and is currently a no-op.
}

#[tauri::command]
pub fn open_sign_in_surface(coordinator: tauri::State<'_, Arc<dyn CaptureSessionControl>>) {
    coordinator
        .inner()
        .submit(CoordinatorCommand::SignInCompleted);
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[cfg(debug_assertions)]
#[tauri::command]
pub fn simulate_error(coordinator: tauri::State<'_, Arc<dyn CaptureSessionControl>>) {
    if let Ok(reason) = ErrorReason::new("Simulated error for smoke test".to_string()) {
        coordinator
            .inner()
            .submit(CoordinatorCommand::SimulateError(reason));
    }
}
