# ADR 0010: Passive audio sensing is on by default

## Status

Accepted. Supersedes the "deferred / optional" framing of passive audio in ADR 0009.
The Private Mode clauses below are superseded by ADR 0012: there is no global
Private Mode; sensing is governed by per-source permissions, enable switches,
exclusions, retention, and clear-all. The rest of this ADR stands.

## Context

The passive audio pipeline (`PassiveAudioCaptureCoordinator` → `PassiveAudioContextPipeline` →
`SileroVoiceActivityGate` → `LocalTranscriptionService` → `AmbientAudioAnalyzer` →
`AudioMemoryStore` → `PerceptionEvent(.ambientAudioSummary)`) shipped in Slice 8 and is fully
wired, but shipped gated off by two `false` defaults: `DesktopUtilitySettings.passiveAudioEnabled`
and `CompilerSettings.ambientAudioCaptureEnabled`. Passive audio is a first-class perception
source for a proactive companion, not an off-by-default extra, so it should default on.

## Decision

- `DesktopUtilitySettings.passiveAudioEnabled` and `CompilerSettings.ambientAudioCaptureEnabled`
  default to `true`, including the decode fallback for settings blobs persisted before this
  field existed.
- Existing users who previously toggled the setting keep their persisted choice; the new
  default only affects fresh or never-toggled installs.
- No safety gate is weakened by this change: capture still requires macOS microphone
  permission, still honors excluded apps, still never retains raw audio, and system
  audio still only runs `.onlyDuringMeetings`. (The original "still pauses in Private
  Mode" clause is superseded by ADR 0012 — sensing is stopped by disabling the source
  or revoking its permission, not by a global mode.) "Default-on" means
  passive audio activates automatically once the user grants microphone permission during
  onboarding, not that it listens without consent.

## Consequences

- Fresh installs that complete onboarding and grant microphone permission get ambient audio
  sensing without an extra opt-in step.
- Documentation describing passive audio as "optional" or "deferred to Slice 8" (ADR 0009,
  `PRIVACY.md`, `CONTEXT.md`, `ARCHITECTURE.md`) is updated to describe it as on by default and
  consent-gated.
- `SystemAudioCaptureMode` remains defaulted to `.onlyDuringMeetings`; this ADR does not change
  system-audio capture policy.
