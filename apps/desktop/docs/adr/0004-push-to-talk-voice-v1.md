# ADR 0004: Push-to-talk voice v1 sends transcripts as user messages

## Status

Superseded by [ADR 0007](0007-bidirectional-voice-v2.md).

## Decision

Desktop voice v1 is push-to-talk capture, local VAD, local transcription, then `user_message` through the Runtime Bridge. There is no realtime server voice endpoint in v1.
