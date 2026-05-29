//! Pure state→menu mapping. No Tauri types here so the descriptor stays
//! unit-testable.

use crate::domains::capture::types::state::CaptureState;

pub const START_CAPTURING_LABEL: &str = "Start Capturing";
pub const STOP_CAPTURING_LABEL: &str = "Stop Capturing";

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MenuItemDescriptor {
    SignIn { enabled: bool },
    Toggle { label: &'static str, enabled: bool },
    ErrorInfo { text: String, enabled: bool },
    Settings { enabled: bool },
    Quit { enabled: bool },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MenuDescriptor {
    items: Vec<MenuItemDescriptor>,
}

impl MenuDescriptor {
    pub fn items(&self) -> &[MenuItemDescriptor] {
        &self.items
    }
}

pub fn describe(state: &CaptureState) -> MenuDescriptor {
    let items = match state {
        CaptureState::Unauthenticated => vec![
            MenuItemDescriptor::SignIn { enabled: true },
            MenuItemDescriptor::Settings { enabled: false },
            MenuItemDescriptor::Quit { enabled: false },
        ],
        CaptureState::Stopped => vec![
            MenuItemDescriptor::Toggle {
                label: START_CAPTURING_LABEL,
                enabled: true,
            },
            MenuItemDescriptor::Settings { enabled: true },
            MenuItemDescriptor::Quit { enabled: true },
        ],
        CaptureState::Capturing => vec![
            MenuItemDescriptor::Toggle {
                label: STOP_CAPTURING_LABEL,
                enabled: true,
            },
            MenuItemDescriptor::Settings { enabled: true },
            MenuItemDescriptor::Quit { enabled: true },
        ],
        CaptureState::Error(reason) => vec![
            MenuItemDescriptor::ErrorInfo {
                text: reason.as_str().to_string(),
                enabled: false,
            },
            MenuItemDescriptor::Settings { enabled: true },
            MenuItemDescriptor::Quit { enabled: true },
        ],
    };
    MenuDescriptor { items }
}
