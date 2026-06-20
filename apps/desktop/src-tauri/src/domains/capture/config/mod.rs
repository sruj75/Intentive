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

/// Resource-relative path the capture supervisor spawns (resolved against the
/// bundle's `Resources` dir at `lib.rs`). ScreenPipe lives inside a child
/// `Intentive Capture.app` so macOS attributes Screen Recording to a
/// product-owned name ("Intentive Capture"), never the bare `screenpipe`
/// binary (ADR-0015). Keep this pointing *inside* the helper bundle — the
/// flat `resources/screenpipe` path would regress the TCC identity. The guard
/// test below pins that invariant.
pub(crate) const CAPTURE_HELPER_RESOURCE_PATH: &str =
    "resources/Intentive Capture.app/Contents/MacOS/screenpipe";

#[cfg(test)]
mod tests {
    use super::CAPTURE_HELPER_RESOURCE_PATH;

    #[test]
    fn helper_resource_path_stays_inside_the_helper_bundle() {
        // Cheap protection against an accidental revert to the flat
        // `resources/screenpipe` path, which would surface `screenpipe` (not
        // "Intentive Capture") in macOS Privacy Settings (ADR-0015/#54).
        assert!(
            CAPTURE_HELPER_RESOURCE_PATH.contains("Intentive Capture.app/Contents/MacOS/"),
            "spawn path must resolve inside the Intentive Capture helper bundle",
        );
        assert!(
            CAPTURE_HELPER_RESOURCE_PATH.ends_with("/screenpipe"),
            "the helper bundle's executable is still the screenpipe binary",
        );
    }
}
