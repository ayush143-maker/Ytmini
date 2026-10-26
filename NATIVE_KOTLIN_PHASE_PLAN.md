# Native Kotlin Migration — Phased Execution Plan

Source analysis first, implementation second. The authoritative behavior map is `NATIVE_ANDROID_ARCHITECTURE.md`.

## Baseline safety rules
- Base revision: `capacitor` at `c9313757b9c39dbe193106bd8f8c2c1813d739fd`.
- Work only on branch `Kotlin`.
- `capacitor` is read-only reference; `main` is out of bounds.
- Runtime must be native Kotlin/Android views + AndroidX Media3 + NewPipeExtractor; no Capacitor bridge/WebView.
- Keep all account/library data on device; no new server, Supabase or cloud sync.
- Commit identity: Claude `<noreply@anthropic.com>`, with ChatGPT co-author trailer `<noreply@openai.com>`.

## Milestones and APK artifacts

### Phase 0 — Study and architecture
- This commit maps each source module, route, request bridge, player control, local storage, build dependency and risk.
- No app implementation changes in this phase.

### Phase 1 — Native build foundation
- Switch the Android module to the Kotlin Gradle plugin and make settings independent of Capacitor projects.
- Replace `BridgeActivity` with a Kotlin `Activity` and create a clean native app shell using the black/off-white palette.
- Add a dedicated `kotlin-apk.yml` workflow triggered by Kotlin-branch pushes and manual dispatch; it builds `assembleDebug` and uploads an APK artifact.
- Acceptance: CI assembles a native APK without running npm or Capacitor sync.

### Phase 2 — Extraction + search + discovery
- Kotlin NewPipeDownloader, one-time extractor initialization, typed models, IO dispatching, search/pagination/suggestions and native Explore/Search screens.
- Acceptance: search performs extraction off the main thread; user sees result/empty/error and retry states.

### Phase 3 — Native player + watch flow
- Native Media3 player controller, watch screen, queue basics, play/pause/seek, speed, playback position, orientation/back handling and progress-to-library.
- Acceptance: selected compatible stream plays, UI reflects actual player state, errors recover without locking the screen.

### Phase 4 — Local library + channels/playlists + study mode
- Versioned local persistence, likes, watch-later, history, own playlists, follows/blocks, video notes, backup import/export, channel/playlist pages, exam/subjects/date preferences and study shelves.
- Acceptance: values persist across process restart; invalid backup is rejected without overwriting existing data.

### Phase 5 — Hardening + final test APK
- Expand unit tests and CI diagnostics, verify app ID/version/permissions, polish offline/error/loading states, check that Capacitor projects and WebView are not in the native dependency graph, create final artifact.
- Real-device tests remain necessary for YouTube extraction and all playback formats.

Every phase commit on `Kotlin` triggers a separate GitHub Actions run; use the latest successful workflow run's artifact for the newest APK. Do not claim real-device validation from a CI build alone.

## Known constraints
This is a real application migration, not a literal Java-to-Kotlin translation. The old UI/router plus data behavior spans roughly two dozen JS modules, and a complete parity rewrite needs iterative builds/testing. A successfully uploaded APK should only be called a deliverable after the workflow run confirms success; UI and extractor/playback runtime behavior still require phone testing.
