# Build and validation

Run commands from the repository root unless noted.

## Commands

| Task | Command |
| --- | --- |
| Full desktop app (preferred) | `npm run tauri dev` |
| Frontend unit tests | `npm test` |
| Frontend typecheck + bundle | `npm run build` |
| Rust check | `cargo check --manifest-path src-tauri/Cargo.toml` |
| Rust tests | `cargo test --manifest-path src-tauri/Cargo.toml` |
| Rust lint (CI parity) | `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` |

`npm run dev` starts Vite only; Tauri invokes it automatically during `tauri dev`.

## CI and release

CI runs the frontend and Rust commands above on every PR. Pushing a `v*` tag triggers the macOS release workflow.

## Auth env (frontend)

The Auth surface requires `VITE_NEON_AUTH_URL=<Neon Auth URL from the Neon Console>` for dev and build. `VITE_NEON_DATA_API_URL` is known but intentionally unused until Auth-resolved Agent Interface configuration lands.
