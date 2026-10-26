# AyuTube Native UI Rebuild — Design Plan and Current Scope

## Design source

The red accent and surfaces are restored from `capacitor` branch CSS read-only: `assets/css/style.css` root tokens `--ink: #000000`, `--slate: #121212`, `--slate-hi: #1d1d1d`, `--steel: #2e2e2e`, `--paper: #f2f2f2`, `--fog: #a6a6a6`, `--dim: #8c8c8c`, `--pink: #fb2a5f`, `--pink-press: #ff4d76`. Main Android UI is reimplemented natively; no source CSS is injected or rendered in a WebView.

## Visual language

- Strict black background with stacked `#121212` panels; use subtle `#2e2e2e` borders to define surfaces.
- Reddish pink `#FB2A5F` is reserved for selected navigation, primary calls to action, badges and small visual markers; pressed accent is `#FF4D76`.
- Boxy layout: small 3–4dp card corners, no giant pill cards, no gradients, restrained typography, 16:9 thumbnails and clear content hierarchy.
- Persistent compact AyuTube wordmark/header with search and profile entry points; fixed five-destination navigation for Home, Search, Library, Study and Account.
- Video cards use real remote thumbnails, duration overlays, two-line titles, channel metadata and contextual action menus. Compact rows are used for local lists/up-next.

## Screen-by-screen plan

1. **Home/feed:** horizontal category chips, compact branded discovery banner, live NewPipe search shelves for trending, music and learning. Loading/failure states must remain explicit; empty categories are not fabricated.
2. **Search:** keyboard search, video/channel/playlist modes, progress/error/retry feedback and thumbnail-based video cards. Video search supports continuation pages; channel/playlist extraction currently shows its initial batch.
3. **Watch/player:** 16:9 Media3 player, title/meta, channel entry, Like, Watch Later, playlist, notes, share and Up Next results. Playback/source selection logic must remain unchanged during visual redesign.
4. **Channel:** creator header with avatar, verification/subscriber metadata and video list.
5. **Playlist:** playlist artwork/title/owner/count, play-first action and ordered list of videos.
6. **Library:** separate History/Liked/Watch Later/Playlists sections, local playlist management and JSON backup import/export.
7. **Study:** exam/date/subject editor and locally persisted countdown, with dates entered by the user labelled as user-entered rather than official.
8. **Account/settings:** local-only profile explanation, routes to Study/Library/Search and accurate privacy/about information.

## Native implementation notes

- All screen hierarchy is Android Views in `MainActivity.kt`; extractor calls remain off the main thread.
- Thumbnails use a bounded in-memory LRU cache and a separate small executor; failed thumbnail loads leave a neutral surface instead of blocking the screen.
- UI changes should not introduce cloud sync, login, backend usage or alter persisted library semantics.
- The existing source branch `capacitor` and default branch `main` are read-only/out of bounds for edits.

## Validation / device test checklist

- [ ] Latest workflow run compiles and runs `testDebugUnitTest` before packaging the debug APK.
- [ ] Home renders dynamic results and retry/failure state with an unreliable network.
- [ ] Search results show real 16:9 thumbnails, duration labels, title/channel metadata and menu actions.
- [ ] Video, channel and playlist routes open; Android Back returns to origin.
- [ ] Player open/pause/seek/release still works; Like, Watch Later, notes, playlist and share actions work.
- [ ] Library tabs and backup import/export preserve the local-only promise.
- [ ] Study values persist after process restart; Account routes work.
- [ ] Test thumbnail loading, scrolling, status/navigation bars and keyboard on a physical phone.

A green CI build proves compilation and JVM tests, not that every upstream YouTube stream or phone-specific UI path works. Keep a real-device test pass as a separate release gate.
