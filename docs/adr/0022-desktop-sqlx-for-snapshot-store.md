# Use sqlx for the local snapshot store

The snapshot store needs a SQLite library. We chose sqlx over rusqlite because the snapshot schema will evolve (transparency UI, delivery error tracking) and sqlx's built-in migration system handles that cleanly. rusqlite would require hand-rolled upgrade logic on every schema change.

## Considered Options

- **rusqlite + spawn_blocking** — simpler initial setup, but requires wrapping every DB call in `spawn_blocking` throughout an async codebase, and schema migrations are DIY.
- **sqlx** — async-native (no `spawn_blocking`), built-in migration files, matches ScreenPipe's own DB stack.

## Consequences

- Features used: `sqlite`, `runtime-tokio-rustls`, `chrono`, `migrate`.
- Use `sqlx::query()` (runtime queries) not the `query!` macro — avoids the `DATABASE_URL` at build time requirement, since the SQLite file path is only known at runtime from Tauri's app data directory.
- Migration files live in `src-tauri/migrations/`. Each future schema change (new column, new table) is a numbered `.sql` file — no hand-rolled upgrade logic.
- ScreenPipe uses sqlx for their high-volume write path (frames, OCR, audio); Intentive's volume is one insert per 10-minute Context Heartbeat tick, so the write queue and connection pool complexity ScreenPipe needed is unnecessary here.
