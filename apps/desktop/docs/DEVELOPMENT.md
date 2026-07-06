# Desktop Development

The current desktop app is a Swift Package Manager macOS app under `apps/desktop/macos`.

```bash
cd apps/desktop/macos
xcrun swift build -c debug --package-path Desktop
xcrun swift test --package-path Desktop
./run.sh
```

Use `./run.sh` for live local runs. Release bundling is handled by `macos/scripts/build-app-bundle.sh`.

The target Protocol spine is:

```text
capture -> Screen Memory / Desktop Context Compiler -> perception_event -> Agent Runtime
floating bar / PTT -> user_message -> Agent Runtime
Agent Runtime -> companion_message -> Effect Runner / floating bar
```

Do not put provider API keys in the desktop app. Local models and local embeddings are allowed; cloud judgment belongs in the Agent Runtime.
