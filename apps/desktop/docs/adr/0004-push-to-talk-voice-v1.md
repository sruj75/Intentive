# ADR 0004: Push-to-talk voice v1 sends transcripts as user messages

## Status

Superseded by [ADR 0009](0009-desktop-v1-surface-and-runtime-boundary.md). ADR 0007 was the intermediate dictation decision.

## Decision

Desktop voice v1 is push-to-talk capture, local VAD, local transcription, then `user_message` through the Runtime Bridge. There is no realtime server voice endpoint in v1.
