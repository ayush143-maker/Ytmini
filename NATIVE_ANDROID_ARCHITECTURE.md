# AyuTube — Native Android Architecture Study

> Written before implementation on branch `Kotlin`. Source of truth for this study: the read-only `capacitor` branch at commit `c9313757b9c39dbe193106bd8f8c2c1813d739fd`. The default `main` branch was not used as an implementation source and was not modified. The `capacitor` branch was only read.

## 1. Product model

AyuTube is a LibreTube-inspired, Android-first YouTube browsing client. Its product promises in `README.md` are: no ads, no account system, no app backend for native content extraction, and user data kept locally. It is licensed GPL-3.0. It supports video discovery/search, YouTube channels and playlists, playback, and a device-local library; the recent `capacitor` snapshot additionally includes a study mode with exam countdown and subject-based video shelves.

This codebase is not merely a static website inside a WebView: it is a hybrid architecture. The presentation, navigation and much product logic are vanilla JavaScript/CSS; Android content extraction is performed locally with NewPipeExtractor through a Capacitor bridge; playback uses AndroidX Media3/ExoPlayer behind a native TextureView. For a native Kotlin rewrite, these responsibilities should become native modules and native screens, not a WebView wrapper.

## 2. What was inspected

The recursive Git tree for `capacitor` contained 195 tracked paths (not truncated). Key files read include:

- `README.md`, `package.json`, `index.html`, `capacitor.config.json`, `.env.example`, `.github/workflows/android-apk.yml`.
- `assets/js/app.js`, `api.js`, `native.js`, `categories.js`, `feed.js`, `cards.js`, `search-ui.js`, `watch.js`, `player.js`, `stream-select.js`, `channel.js`, `playlist.js`, `following.js`, `library.js`, `library-ui.js`, `auth.js`, `onboarding.js`, `study.js`, `account-ui.js`, `avatars.js`, `welcome.js` and `style.css` / `assets/css/style.css`.
- `android/app/build.gradle`, `android/build.gradle`, `android/settings.gradle`, `android/variables.gradle`, `android/app/src/main/AndroidManifest.xml`, `MainActivity.java`, `AyuExtractorPlugin.java`, `AyuPlayerPlugin.java`, `AyuNativePlugin.java`, and `ExtractorDownloader.java`.

## 3. Current interaction and route map

`index.html` is the view shell and loads CSS and module scripts. `assets/js/app.js` is the main orchestrator and maintains these state dimensions:

- Primary view: `explore`, `library`, `account`.
- Explore pane: `browse`, `watch`, `channel`, `playlist`.
- Browse mode: `feed` or `results`.
- Search state: exact query, video/playlist/channel search types, pagination tokens, duration filter, previous results and request IDs to avoid stale updates.
- Local personalization: user profile, interests, blocked channels, study-mode flag and personal library snapshot.

The app has an explicit navigation/history model. Opening a watch, channel or playlist pane pushes a state record; the Back key / browser history path restores previous views. The mini-player/now-playing area is managed from the app coordinator. Native implementation should use a single Activity with explicit screen state/back stack (or Navigation component) and a shared playback service/session, rather than reproducing a web history stack.

### Explore, home and categories

`assets/js/categories.js` is the catalog of category groups, topics and search suggestions. `assets/js/feed.js` renders topic-based home shelves and category feeds. It requests batches of topics, interleaves results from topics, deduplicates videos and caches groups in `sessionStorage` for 10 minutes. It renders loading/error/retry states and, in study mode, delegates to `study.js`. Home can include unfinished/continue-watching entries and the "Because you watched" shelves. Video result presentation is delegated to `cards.js`.

### Search

`app.js` coordinates a search query across videos, playlists and channels and keeps each result kind's pagination token. `search-ui.js` provides local recent-query suggestions, topic suggestions and titles encountered in prior results; suggestions while typing are local. Search validates input and result formats. `assets/js/api.js` is the browser/server-compatible API client: `GET /api/search?q=...`, `/api/playlist?id=...`, and `/api/streams?id=...`, with JSON validation, timeouts, AbortController cancellation, retryable error classification and query/video/playlist ID validation.

### Native routing of content requests

On native Android, `assets/js/native.js` detects `Capacitor.isNativePlatform()`, registers `AyuExtractor`, `AyuPlayer` and `AyuNative`, normalizes/validates items, memoizes requests and intercepts relevant `/api/*` fetches. Thus the native app does not require a content backend: the native bridge routes search/feed/channel/playlist/stream requests to NewPipeExtractor running on device. In a browser, `native.js` exits and `api.js` uses HTTP endpoints. Keep this distinction explicit in the migration so the native branch does not accidentally depend on `/api/*` being deployed.

### Video watch and player

`assets/js/watch.js` opens a video immediately, loads stream details asynchronously and uses history to resume the last position. It also handles related streams, playlist context (previous/next/autoplay), and watch actions. `assets/js/player.js` draws the player controls and expects a native video surface beneath the transparent control layer. Stream choice is isolated in `stream-select.js`.

`AyuPlayerPlugin.java` creates an AndroidX Media3 ExoPlayer, renders video through a TextureView, emits playback-state ticks and handles play/open/pause/seek/speed/release, bounds/layer/resize, fullscreen, background playback, brightness and volume. The `open` payload supplies a URI, optional audio URI, start position, autoplay and speed. Its listener surfaces errors and playback state changes. For native Kotlin, use ExoPlayer directly (Media3 1.5.1 from the inspected source) and keep player state outside an Activity so rotations/navigation don't destroy playback.

### Channels and playlists

`assets/js/channel.js` renders channel metadata, avatar/banner/description, videos and playlists. The extractor supports channel detail, paginated videos, avatar-only lookup and channel playlists. `assets/js/playlist.js` opens playlists, renders videos and pagination, starts a list in order and manages playlist context for playback. Keep stable video/channel/playlist IDs and explicit loading/empty/error states.

### Local library, preferences and account

`assets/js/library.js` is the canonical local data model. It validates fields/IDs, migrates/merges state, batches saves, prefers IndexedDB database `ayutube-local` (`kv` store, key `state`) and falls back to localStorage key `ayutube.local.state.v1`. Its domain includes playlists and items, watch-later, history/progress, preferences, followed/blocked channels, likes and timestamped notes. Its API includes playlist CRUD/items, history/progress, watch-later, likes, follows, preferences, notes and import/export backup. `library-ui.js` renders these sections. The native implementation should make persistence an explicit repository with versioned storage and backup/import validation, not duplicate state inside individual screens.

`assets/js/auth.js` is intentionally a local-profile compatibility shim: there are no accounts or server authentication. Sign-up/sign-in throw a message explaining that accounts do not exist; sign-out is effectively a local UI action. `onboarding.js` captures interests for local feed personalization. The account screen owns local preferences and backup actions; do not introduce Supabase/auth or cloud sync as part of this rewrite.

### Study mode

`assets/js/study.js` offers exam presets (including CUET, NEET, JEE and custom exam), a chosen/editable date, a subject chip selection capped at eight, and a countdown. Default dates are predictions based on usual timing, explicitly not official exam dates. In study mode the home feed shows one shelf per subject; normal mode can show history-derived personalized shelves. Persist exam name/date/subjects and study toggle in the local profile/preferences. Clearly label predicted dates and preserve manual override.

### Native file/share helpers

`AyuNativePlugin.java` provides small native helpers, including backup file sharing. `AyuExtractorPlugin.java` initializes NewPipeExtractor once with a custom `ExtractorDownloader`, en-US localization and US content country, then executes extractor work off the UI thread. It exposes `search`, `suggestions`, `streams`, `channel`, `channelAvatar`, `channelPlaylists`, and `playlist`. `ExtractorDownloader.java` uses OkHttp 4.12.0, a browser-like user agent, 15s connect timeout and 30s read timeout; HTTP 429 is translated into a ReCaptcha exception. The extractor dependency in this snapshot is `com.github.TeamNewPipe:NewPipeExtractor:v0.26.5`.

## 4. Existing build baseline

- Application ID / package: `com.ayutube.app`.
- Original Android project: `android/`; Android Gradle Plugin 8.7.2, Gradle wrapper, Java 17 source compatibility, compile/target SDK 35, min SDK 26, Java runtime in CI 21.
- Existing runtime libraries: NewPipeExtractor v0.26.5, OkHttp 4.12.0, Media3 ExoPlayer/HLS/OkHttp datasource 1.5.1.
- Original `android/settings.gradle` includes Capacitor modules; `MainActivity.java` extends `BridgeActivity` and registers the three plugins. These pieces must be removed/replaced on branch `Kotlin` to produce an actual native app.
- Existing `.github/workflows/android-apk.yml` triggers on pushes to `capacitor`, PRs targeting `main`, and manual dispatch. It runs npm install, `npm run cap:sync`, then `./gradlew assembleDebug`, and publishes `ayutube-debug-apk`. Its push trigger does not cover the `Kotlin` branch and its build invokes Capacitor sync, so a separate native-only workflow is required.

## 5. Native Kotlin target architecture

The implementation should use one native Android Activity and a small set of Kotlin modules:

- `MainActivity.kt`: theme, screen host, bottom navigation, back behavior and safe top-level state.
- `data/model/Video.kt`, `Channel.kt`, `Playlist.kt`, `PlaybackStream.kt`: typed data models with ID/URL normalization.
- `data/extractor/NewPipeRepository.kt`: one NewPipe initialization, IO dispatcher, search/page continuation, stream info, channel info/videos/playlists, suggestions and mapping into typed models. It must not do network/extractor work on the main thread.
- `data/player/PlaybackController.kt` (later a MediaSessionService): own ExoPlayer, queue, current item, position, speed, pause/play/seek and recoverable error state.
- `data/local/LibraryRepository.kt`: versioned local storage for history/progress, liked, watch-later, playlists, follows/blocks, notes, preferences and study settings; import/export JSON with limits and schema validation.
- `ui/ExploreScreen.kt`, `SearchScreen.kt`, `WatchScreen.kt`, `ChannelScreen.kt`, `PlaylistScreen.kt`, `LibraryScreen.kt`, `StudySettingsScreen.kt`, `SettingsScreen.kt`: native views and explicit loading/empty/error states.

The product styling from the source is black/obsidian with off-white and restrained grey. Prefer native, accessible touch targets, system insets and compact editorial typography. Do not preserve the WebView or Capacitor as a runtime dependency. Source JS can remain in the branch as historical reference until the Kotlin feature parity is verified; it must not be packaged or loaded by the native app.

## 6. Risk notes discovered during study

- YouTube extraction is brittle by nature; upstream format changes or rate limits may break search/playback. Keep extractor errors visible and retry actions bounded.
- NewPipeExtractor has its own service/library lifecycle; initialize once and serialize/debounce repeated work where needed.
- Video-only streams can lack audio; direct playback must choose a compatible progressive stream or correctly merge video + audio/DASH/HLS, rather than assuming every `videoStreams` item includes audio. The previous bridge filtered progressive streams.
- Channel/playlist IDs differ from video IDs; do not use a single validator for every entity.
- Local library write batching and fallback behavior are part of data safety. Migration must not discard old data and should provide a backup path before attempting any import/migration.
- No backend/server means no account sync and some browser-mode `/api/*` behavior is separate. Never represent locally stored data as cloud backed.
- The repo is GPL-3.0; derivative distributed builds should retain required source/license notices.

## 7. Validation checklist

1. Verify the Kotlin branch is based on the recorded Capacitor SHA and never write to `main` or `capacitor`.
2. Build a debug APK with the native-only Gradle project (without npm install, Capacitor sync or WebView runtime).
3. Check app launch, theme/insets, navigation/back, search result mapping, extractor errors, player open/pause/seek/state, and local library persistence.
4. Confirm no Capacitor classes/plugin projects are included in the Kotlin build.
5. Produce build artifacts for each milestone, retain prior artifact links/runs and make final user testing use the latest APK. An uploaded artifact is a CI output, not proof that real-device playback has passed.
