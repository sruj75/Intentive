//! Cross-cutting infrastructure shared across domains — the binary-local
//! analog of `packages/providers/`. Any domain layer may reference
//! `crate::providers::…`; it is intentionally outside the layered-domain rule.

pub mod permissions;
pub mod port;
