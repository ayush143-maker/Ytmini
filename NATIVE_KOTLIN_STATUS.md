# Kotlin branch — current implementation status

**Branch:** `Kotlin`  
**Base:** `capacitor` at `c9313757b9c39dbe193106bd8f8c2c1813d739fd` (read-only source).  
**Runtime:** native Android Activity/Kotlin + NewPipeExtractor + AndroidX Media3. The Gradle project includes only `:app`; it does not apply Capacitor plugins, load a WebView, run npm or call Capacitor sync. The legacy web files remain in this source snapshot as historical reference and are not part of the Android runtime/build.

## Implemented on the native branch

- Dark obsidian/off-white UI shell and bottom navigation for Home, Search, Library, Study and Account.
- Direct, on-device NewPipeExtractor initialization and HTTP downloader with timeouts, user-agent, basic URL checks and explicit ReCaptcha/HTTP failure handling.
- Video search with continuation pages, loading/empty/error/retry states and quick-search topics.
- Separate channel and playlist search modes with native detail routes and initial result lists.
- Native AndroidX Media3 `PlayerView` playback for a compatible progressive video stream, with an audio-stream fallback, standard play/pause/seek controls, error messages and local watch progress resume.
- Device-local likes, Watch Later, watch history, custom playlists, per-video notes and editable exam/date/subject preferences.
- Versioned JSON library export and guarded import. Import parses/validates bounds and item IDs before replacing current local records; malformed JSON leaves current preferences unchanged.
- A Kotlin-only GitHub Actions workflow. Each run checks out the exact triggering commit, executes Gradle, and uploads a run-specific APK artifact for 14 days. Build steps now include JVM unit tests.
- `NATIVE_ANDROID_ARCHITECTURE.md` maps source responsibilities and original route/data contracts. `NATIVE_KOTLIN_PHASE_PLAN.md` documents the phased migration.

## Known gaps — do not treat as complete YouTube-client parity

- The current native UI is a functional alpha, not a full pixel/feature parity port of every JS module.
- Extractor pagination is currently wired for video search; channel and playlist pages currently show their first extracted batch, without full continuation controls.
- Playback intentionally selects compatible progressive URLs; separate DASH video+audio streams are not muxed, and HLS/live/DRM-like formats may fail. NewPipe/YouTube upstream changes and throttling can affect availability.
- Playback is Activity-owned, not yet a persistent MediaSessionService; background audio and robust queue/autoplay are not implemented.
- No offline video downloading, transcript/subtitle/chapter UI, channel follow/block workflows, or cloud login/sync. The Account screen is a local-only placeholder.
- The native library currently uses a new SharedPreferences JSON schema. It does not automatically migrate the old Capacitor browser IndexedDB/localStorage; export/import support is for the new native backup format.
- Playlist/channel pagination, playlist ordering/editing UI and a full notes manager need follow-up work. The native video list currently uses compact text cards rather than loading full thumbnails.
- CI only proves compilation and unit tests. Search and playback must be exercised on a real phone/network; one successful APK is not proof every YouTube stream works.

## Current phone-test checklist

1. Install the latest APK artifact from the newest successful **Native Kotlin APK** run on this branch.
2. Open Search and try video, channel and playlist queries separately.
3. Open a video; verify stream extraction, playback, seek/pause, Like, Watch Later, Add to playlist and Video note.
4. Create a study plan, exit/reopen the app and check local persistence.
5. Export a JSON backup, import a valid backup, and test that invalid text is rejected without wiping current data.
6. Report failing query/URL plus the on-screen error; YouTube extraction is the most upstream-sensitive component.
