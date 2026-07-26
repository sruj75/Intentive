# Desktop Privacy

Intentive Desktop keeps raw screenshots, video chunks, thumbnails, and raw audio on the signed-in user's Mac. The local source of truth is the per-user `intentive.db` profile plus its media archive.

The Runtime may receive only compact text/metadata records: permitted OCR, app/window metadata, summaries, confidence, expiry, retention class, and opaque local record UUIDs. It never receives raw media or local filesystem paths. Hard-secret records retain local truth while outbound OCR/title content and embeddings are replaced with a safe placeholder.

User controls are enforced behavior, not presentation-only settings:

- The normal v1 surface has one Pause/Resume Coaching control rather than
  independent source-enable switches. Pause ends the current Coaching Window,
  finalizes active capture, and synchronously stops screen, microphone, and
  system-audio sensing. Revoking any required permission also ends the window
  and fails closed (ADR 0012).
- Excluded applications are rejected before OCR, archive, outbox, or proactive-context paths.
- Retention defaults to 7 days, supports 3/7/14/30 days, applies to existing records, and physically removes expired containing video chunks.
- Clear-all removes local records/media and emits the authenticated user's tombstone.
- Passive audio starts only inside an eligible Coaching Window; it never fills
  the Floating Bar composer, retains no raw audio, and synchronizes only compact
  hard-secret-filtered summaries. It requires the relevant permission, stops
  with Pause Coaching or permission loss, and honors excluded apps.
- The microphone and system-audio process tap are both required while a
  Coaching Window is active. Because Core Audio exposes system-audio
  authorization only by attempting capture, an observable tap-start failure
  stops both audio sources and closes the whole window fail closed.
- Telemetry is deny-by-default. Sentry/PostHog never receive screenshots, OCR, app/window titles, audio transcripts, conversation text, tokens, or local paths.
- Local diagnostics rotate at 14 days or 100 MB and can be exported or cleared by the user.
- Report Issue uploads only after **Send Report**. Its diagnostics attachment comes from the same privacy-filtered store and excludes OCR, titles, transcripts, conversation text, tokens, and local paths. **Save Diagnostics** is offline-only.

The Desktop Client is a sensing body and local memory surface. Agent Runtime remains the only reasoning brain and Conversation History remains server truth.
