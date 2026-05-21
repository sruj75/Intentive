//! Configuration constants for the capture session. Centralised so call sites
//! never embed magic numbers or error copy strings.

/// Port on which Intentive's bundled ScreenPipe binary listens. Chosen to
/// avoid collisions with default `3030` and other common developer ports
/// (ADR-0013).
pub(crate) const PORT: u16 = 44380;

/// Capture Error copy surfaced when the pre-spawn TCP probe finds the port
/// already bound (ADR-0013). The user-facing string lives here so callers
/// never embed copy.
pub(crate) const PORT_CONFLICT_COPY: &str = "Can't start — port conflict";

/// Delay between an unexpected ScreenPipe exit and the single silent retry
/// (ADR-0011). Short enough that the user doesn't notice a hiccup; long
/// enough that we're not in a tight respawn loop.
pub(crate) const RETRY_DELAY: std::time::Duration = std::time::Duration::from_secs(2);

/// Capture Error copy surfaced when the silent retry also fails (ADR-0011).
/// Deliberately user-language; no ScreenPipe terminology.
pub(crate) const CRASH_COPY: &str = "Something went wrong — relaunch";
