# Desktop Development

The current desktop app is a Swift Package Manager macOS app under `apps/desktop/macos`.

```bash
cd apps/desktop/macos
xcrun swift build -c debug --package-path Desktop
xcrun swift test --package-path Desktop
./run.sh
```

Use `./run.sh` for live local runs. Release bundling is handled by `macos/scripts/build-app-bundle.sh`; pass `INTENTIVE_APP_VERSION`, `INTENTIVE_APP_BUILD`, `INTENTIVE_AUTH_CALLBACK_SCHEME`, `INTENTIVE_SPARKLE_FEED_URL`, and `INTENTIVE_SPARKLE_PUBLIC_ED_KEY` when assembling a release candidate outside GitHub Actions.

To connect the executable to the local stack, start the Control Plane and Agent Runtime from the root runbook, then launch Desktop with:

```bash
export INTENTIVE_CONTROL_PLANE_URL=http://localhost:8080
export INTENTIVE_DESKTOP_USER_JWT="$(scripts/local-dev-auth-token.mjs --user-id local-dev-user)"
cd apps/desktop/macos
./run.sh
```

Without `INTENTIVE_DESKTOP_USER_JWT`, Desktop uses its Keychain-backed hosted-auth seam and reports sign-in required until a token is available.

Hosted auth configuration:

```bash
export INTENTIVE_HOSTED_AUTH_URL=https://<auth-host>/sign-in
export INTENTIVE_AUTH_CALLBACK_SCHEME=intentive-desktop
# Required only when the callback returns an authorization code instead of a JWT.
export INTENTIVE_AUTH_TOKEN_EXCHANGE_URL=https://<auth-host>/desktop/token
```

The native path opens `INTENTIVE_HOSTED_AUTH_URL` with `ASWebAuthenticationSession`, validates the callback `state`, stores only the returned User JWT in Keychain, and never stores provider API keys on the Mac.

The target Protocol spine is:

```text
capture -> Screen Memory / Desktop Context Compiler -> perception_event -> Agent Runtime
floating bar / PTT -> user_message -> Agent Runtime
Agent Runtime -> companion_message -> Effect Runner / floating bar
```

Do not put provider API keys in the desktop app. Local models and local embeddings are allowed; cloud judgment belongs in the Agent Runtime.
