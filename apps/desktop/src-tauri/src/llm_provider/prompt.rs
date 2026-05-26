//! Privacy-constrained prompt for Context Snapshot summarization.
//! The instructions are part of the v1 privacy guarantee — see SPEC §Privacy.

const SYSTEM_INSTRUCTIONS: &str = "\
You summarize a 10-minute window of a user's computer activity into a single \
prose paragraph for an assistant agent. Do not include passwords, credentials, \
financial data, or personal identifiers. If you see any such content, omit it \
silently. Output only the summary text — no preamble, no JSON.";

pub(super) fn system_instructions() -> &'static str {
    SYSTEM_INSTRUCTIONS
}

pub(super) fn user_message(activity: &str) -> String {
    format!("Activity:\n{activity}")
}
