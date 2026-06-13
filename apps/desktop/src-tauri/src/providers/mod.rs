//! Cross-cutting infrastructure shared across domains — the binary-local
//! analog of `packages/providers/`. Any domain layer may reference
//! `crate::providers::…`; it is intentionally outside the layered-domain rule.

pub mod permissions;
pub mod port;

/// Dev-only structured smoke trace (#35). Present only in `debug_assertions`
/// builds so it can never ship in the notarized release.
#[cfg(debug_assertions)]
pub mod smoke;
