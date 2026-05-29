//! The layered business domains for the Desktop Client.
//!
//! Every operational module lives under `domains/<domain>/<layer>/`, where
//! `<layer>` is one of `types → config → repo → service → runtime → ui`
//! (cross-cutting concerns go in `providers/`). Code may only reference same
//! or lower layers within its own domain; cross-domain wiring happens at the
//! `lib.rs` composition root via trait seams. Enforced by
//! `tools/linters/rust-architecture/`.

pub mod capture;
pub mod menubar;
pub mod snapshots;
pub mod summarization;
