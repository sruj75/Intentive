# ADR 0002: Desktop Context Compiler v1 is deterministic and local

## Status

Accepted.

## Decision

The v1 Desktop Context Compiler uses local OCR and deterministic metadata analyzers to produce `perception_event` records. Local vision models are allowed as a flagged upgrade path. Cloud model judgment stays in the Agent Runtime.
