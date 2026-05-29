//! Pure, Tauri-free menu bar mapping: `CaptureState` → menu descriptor and
//! tray-icon path. Unit-tested in isolation; the `ui` layer renders these.

pub mod icon;
pub mod menu;

#[cfg(test)]
mod tests;
