# AyuTube: Kotlin rewrite plan

Branch `Aurix-to-Kotlin` starts as an exact copy of `capacitor` (the web/Capacitor app is kept
untouched for reference). The new native app lives in `kotlin/` and is built by
`.github/workflows/android-kotlin.yml`. When it reaches parity, the old web and Capacitor files
are removed from this branch.

## Why start with playback

The Capacitor app's worst bug (video not progressing, seek and quality switch restarting) sits in
the stream-loading layer, not in the web view, so a rewrite does not fix it by itself. Phase 0 is
therefore a small Kotlin app that searches and plays a video and prints the player's state and
errors on screen. Everything else is built on top once that works.

## Stack

Kotlin, Jetpack Compose (Material 3), Media3 ExoPlayer, NewPipeExtractor (on-device), Room (local
data), Coil (images), DataStore (settings), coroutines. Package `com.ayutube.kt`. GPL-3.0.

## Phases

0. **Skeleton and playback proof** (this commit): search, results list with infinite scroll,
   watch screen with Media3 `PlayerView`, adaptive vs muxed streams, on-screen diagnostics,
   black splash and vector logo, Back sends the app to the background.
1. **Reliable streaming**: fix whatever phase 0 shows (headers, chunked range requests, muxed
   fallback with a watchdog), then SABR groundwork.
2. **Local data (Room)**: history with progress, watch later, likes, playlists, follows with
   channel pictures, notes, profile, JSON export and import. Replaces the web `library.js`.
3. **Home**: normal mode shows music, fun, trending and mixed topics, diversified so no topic
   floods the list, plus "because you watched" from history. No sign-in, no onboarding.
4. **Watch screen**: custom Compose controls like LibreTube (double-tap seek, swipe brightness and
   volume, long-press 2x, speed, quality, audio, aspect, fullscreen), YouTube-like layout, Up Next
   with 3 or 4 related videos then a mix, chapters, subtitles, SponsorBlock.
5. **Mini player and background**: MediaSessionService, notification controls, mini bar above the
   bottom bar, picture-in-picture.
6. **Library**: overview blocks, shelves, history, playlists, watch later, liked, following with
   pictures.
7. **Channel page**: banner, about, tabs (videos, playlists), infinite scroll, follow.
8. **Study mode**: toggle, exam presets (CUET, NEET, JEE Main, JEE Advanced, boards, custom) with
   predicted next date, subjects (own subjects allowed), countdown, subject shelves, notes only in
   study mode.
9. **Polish and cleanup**: icon and splash, settings, remove the legacy web and Capacitor files.

## Rules

Every phase ends with a green CI build and an APK to test. Commits are authored by Claude with a
`Co-authored-by` trailer.
