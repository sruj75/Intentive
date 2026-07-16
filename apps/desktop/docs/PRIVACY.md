# Desktop Privacy

Intentive Desktop keeps raw screenshots, video chunks, thumbnails, and raw audio on the signed-in user's Mac. The local source of truth is the per-user `intentive.db` profile plus its media archive.

The Runtime may receive only compact text/metadata records: permitted OCR, app/window metadata, summaries, confidence, expiry, retention class, and opaque local record UUIDs. It never receives raw media or local filesystem paths. Hard-secret records retain local truth while outbound OCR/title content and embeddings are replaced with a safe placeholder.

User controls are enforced behavior, not presentation-only settings:

- Private Mode flushes the active video chunk and pauses screen, microphone, and system-audio sensing until explicit resume.
- Excluded applications are rejected before OCR, archive, outbox, or proactive-context paths.
- Retention defaults to 7 days, supports 3/7/14/30 days, applies to existing records, and physically removes expired containing video chunks.
- Clear-all removes local records/media and emits the authenticated user's tombstone.
- Passive audio is optional, never fills the Floating Bar composer, retains no raw audio, and synchronizes only compact hard-secret-filtered summaries.
- Telemetry is deny-by-default. Sentry/PostHog never receive screenshots, OCR, app/window titles, audio transcripts, conversation text, tokens, or local paths.
- Local diagnostics rotate at 14 days or 100 MB and can be exported or cleared by the user.

The Desktop Client is a sensing body and local memory surface. Agent Runtime remains the only reasoning brain and Conversation History remains server truth.
