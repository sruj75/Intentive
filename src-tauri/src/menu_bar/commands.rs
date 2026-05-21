//! Tauri command inner functions. The `#[tauri::command]` wrappers in this
//! module resolve managed state and call the corresponding `*_inner`
//! function — the inners are pure and unit-testable.

use std::sync::Arc;

use crate::capture_state::{StubAuthChecker, TransitionError};

use super::menu::{describe, MenuDescriptor};
use super::state_holder::StateHolder;

pub fn toggle_capture_inner(holder: &StateHolder) -> Result<MenuDescriptor, TransitionError> {
    let next = holder.toggle()?;
    Ok(describe(&next))
}

pub fn open_settings_inner(holder: &StateHolder) -> MenuDescriptor {
    describe(&holder.snapshot())
}

pub fn open_sign_in_surface_inner(
    holder: &StateHolder,
    stub: &Arc<StubAuthChecker>,
) -> MenuDescriptor {
    stub.set_signed_in(true);
    let next = holder.mark_signed_in();
    describe(&next)
}
