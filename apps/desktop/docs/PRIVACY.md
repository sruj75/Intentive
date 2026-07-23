# Desktop Privacy

Intentive Desktop keeps raw screenshots, video chunks, thumbnails, and raw audio on the signed-in user's Mac. The local source of truth is the per-user `intentive.db` profile plus its media archive.

The Runtime may receive only compact text/metadata records: permitted OCR, app/window metadata, summaries, confidence, expiry, retention class, and opaque local record UUIDs. It never receives raw media or local filesystem paths. Hard-secret records retain local truth while outbound OCR/title content and embeddings are replaced with a safe placeholder.

User controls are enforced behavior, not presentation-only settings:

- Screen capture and each audio source have explicit enable switches. Disabling a source — or revoking its macOS permission — finalizes the active video chunk and stops that source's sensing. There is no global Private Mode; sensing is governed per source (ADR 0012).
- Excluded applications are rejected before OCR, archive, outbox, or proactive-context paths.
- Retention defaults to 7 days, supports 3/7/14/30 days, applies to existing records, and physically removes expired containing video chunks.
- Clear-all removes local records/media and emits the authenticated user's tombstone.
- Passive audio is on by default and activates once the user grants microphone permission; it never fills the Floating Bar composer, retains no raw audio, and synchronizes only compact hard-secret-filtered summaries. It remains fully user-controllable and still requires mic permission, still stops when its enable switch is turned off, and still honors excluded apps.
- The microphone uses a continuous CoreAudio source only while desired policy and permission allow it. The system process tap starts only for a detected meeting (with off-hysteresis) unless the user explicitly chooses another system-audio mode; failure of that optional tap does not stop microphone sensing.
- Telemetry is deny-by-default. Sentry/PostHog never receive screenshots, OCR, app/window titles, audio transcripts, conversation text, tokens, or local paths.
- Local diagnostics rotate at 14 days or 100 MB and can be exported or cleared by the user.
- Report Issue uploads only after **Send Report**. Its diagnostics attachment comes from the same privacy-filtered store and excludes OCR, titles, transcripts, conversation text, tokens, and local paths. **Save Diagnostics** is offline-only.

The Desktop Client is a sensing body and local memory surface. Agent Runtime remains the only reasoning brain and Conversation History remains server truth.
