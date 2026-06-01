//! Configuration constants for the capture session. Centralised so call sites
//! never embed magic numbers or error copy strings.

/// Primary port for Intentive's bundled ScreenPipe binary (ADR-0013).
pub(crate) const PORT: u16 = 44380;

/// Fallback port — used when the primary is occupied, typically by a zombie
/// ScreenPipe from a crashed prior Intentive session. ADR-0013 picks `+2` so
/// neither bundled binary can ever claim the other's fallback slot.
pub(crate) const PORT_FALLBACK: u16 = 44382;

/// Capture Error copy surfaced when both the primary and fallback ports are
/// occupied (ADR-0013).
pub(crate) const PORT_CONFLICT_COPY: &str = "Can't start — all Intentive ports in use";

/// Delay between an unexpected ScreenPipe exit and the single silent retry
/// (ADR-0011). Short enough that the user doesn't notice a hiccup; long
/// enough that we're not in a tight respawn loop.
pub(crate) const RETRY_DELAY: std::time::Duration = std::time::Duration::from_secs(2);

/// Capture Error copy surfaced when the silent retry also fails (ADR-0011).
/// Deliberately user-language; no ScreenPipe terminology.
pub(crate) const CRASH_COPY: &str = "Something went wrong — relaunch";
