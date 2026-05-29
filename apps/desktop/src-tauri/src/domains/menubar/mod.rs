//! Menu bar domain — the macOS tray UI plus the pure state→menu/icon mapping
//! it renders. The `ui` layer owns Tauri plumbing and command handlers; the
//! `service` layer owns the Tauri-free descriptor logic so it stays
//! unit-testable. Cross-domain state types come from `capture::types`.

pub mod service;
pub mod ui;
