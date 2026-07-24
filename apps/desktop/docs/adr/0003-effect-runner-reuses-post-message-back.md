# ADR 0003: Effect Runner v1 reuses Post-Message-Back

## Status

Superseded by [ADR 0009](0009-desktop-v1-surface-and-runtime-boundary.md).

## Decision

Desktop intervention v1 consumes `companion_message` events where `via_post_message_back` is true. It renders a macOS notification and a floating-bar nudge, then acks through `delivery_ack`. A dedicated effect Protocol event is deferred until a real second effect family needs it.
