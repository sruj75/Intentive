# ADR 0001: Raw frames stay local by default

## Status

Accepted.

## Decision

The Desktop Client keeps raw frames, recordings, and audio on the Mac by default. The Desktop Context Compiler may send compact `perception_event` records containing summaries, signals, local embedding references/vectors, sensitivity labels, retention class, confidence, and local record references.

Scoped frame upload is a future explicit exception only: policy-gated, audited, and off by default.
