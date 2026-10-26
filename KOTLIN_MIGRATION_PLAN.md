# AyuTube: Capacitor to Kotlin migration plan

This replaces the first `KOTLIN_PLAN.md`. The aim is **the same app, same screens, same features,
same look, written in pure Kotlin** with no WebView and no Capacitor. The web/Capacitor files stay
on this branch as the reference until the Kotlin app reaches parity, then they are deleted.

## 1. What went wrong with the first attempt

The first commit on this branch was a throw-away proof (search list plus a player), not a port.
It ignored the existing screens and design. It is **not** the app. Only its data and player layer
are reused; every screen is rebuilt to match the Capacitor app.

## 2. What the proof did show

The Kotlin proof plays video: adaptive 720p video plus audio, position moving, buffering ahead.
So extraction and streaming work natively, and the Capacitor video bug was in the WebView layer
(transparent "hole", event bridge). Kotlin does not need either.

## 3. Inventory of the current app (source of truth)

Taken from the code on `capacitor` (about 16,000 lines).

### Shell (`index.html`, `app.js`)
- Header with the brand mark (`assets/icons/logo.svg`) and the word "ayutube" in the Sacramento
  script face.
- Bottom tab bar: Explore, Library, Account. A mini player bar sits above it.
- Android Back: walks back through screens, then sends the app to the background.

### Explore
- Search field with a Search button and suggestions (search history, learned topics, extractor
  suggestions) (`search-ui.js`).
- Category strip (`categories.js`, 21 categories with sub-topics): Oggy, ISI Prep, Coding, Quant,
  Facts, JEE, NEET, Class 10, Class 12, Olympiad, Physics, Chemistry, Maths, Biology, English,
  Chess, Space, Experiments, Music, Games, Fun. Defaults: Music, Games, Fun.
- Feed (`feed.js`, `study.js`): exam countdown, lead card, horizontal shelves per topic, endless
  scroll, "because you watched" shelves, study-mode feed (subject shelves).
- Search results grid with endless scroll; channel page; playlist page.

### Video card (`cards.js`)
- 16:9 thumbnail, duration badge, watched-progress bar, channel picture, two-line title,
  "channel . views . age", three-dot menu: Save to Watch Later, Add to playlist (with create),
  Copy link, plus block/hide items.

### Watch page (`watch.js`, `player.js`)
- Player with LibreTube-style controls: tap, double-tap seek, long-press 2x, swipe brightness and
  volume, seek bar, quality / speed / audio / aspect sheet, fullscreen.
- Title, channel row with Follow, actions (Like, Save, Share, Previous/Next, Speed, Autoplay),
  description with Show more, Notes (study mode only), Up Next, history and resume.

### Channel and playlist (`channel.js`, `playlist.js`, `following.js`)
- Channel: banner, picture, name, subscribers, Follow / Block, About, tabs Videos and Playlists,
  endless scroll.
- Playlist page: items, play, save a YouTube playlist locally.

### Library (`library-ui.js`, `library.js`)
- Overview blocks and shelves; Playlists (create, favourite, rename, delete, progress), Watch
  later, Liked, History (remove, clear), Following (picture and name).

### Account (`account-ui.js`, `study.js`)
- Your data (counts, export, import, erase), Study mode (exam presets with predicted next date,
  your own exam, subjects incl. custom, countdown), Preferences (Pause history, Autoplay next
  video, Clean controls), Interests, About (GPL-3.0).

### Local data (`library.js`)
playlists, playlist_items, watch_later, watch_history (with progress), channel_preferences
(follow/block + picture), video_notes, video_likes, profile (interests, exam, subjects).
Export format: JSON with `app: "ayutube"` (the Kotlin app must read and write the same file so
data moves across).

### Data source (`AyuExtractorPlugin.java`)
NewPipeExtractor: search, suggestions, streams, channel (+ tabs, banner, about), playlist,
channel picture.

## 4. Design to carry over

Colours: ink #000, slate #121212, slate-hi #1d1d1d, steel #2e2e2e, paper #f2f2f2, fog #a6a6a6,
dim #8c8c8c, pink #fb2a5f (press #ff4d76). Fonts: Schibsted Grotesk 400-800 and Sacramento
(bundled in the APK). Gutter 16 dp, bottom bar 60 dp plus inset. Your later requests apply:
smaller two-line titles, full-width thumbnails, channel pictures, off-white and obsidian Library,
black splash, logo turned 90 degrees right.

## 5. Kotlin architecture

Single Activity, Jetpack Compose, Navigation Compose, ViewModels, Room, DataStore, Coil,
Media3, NewPipeExtractor. Manual dependency wiring (no Hilt) to keep the build simple.

```
ui/theme        colours, fonts, shapes
ui/components   VideoCard (grid, lead, compact), Chip, Panel, Skeleton, ActionSheet, TabBar, MiniPlayer
ui/home         Explore: search, categories, feed, results
ui/watch        player, controls, details, up next, notes
ui/channel      channel + playlist pages
ui/library      overview, lists
ui/account      data, study mode, preferences, about
data/extractor  NewPipe wrapper (reused)
data/db         Room entities and DAOs, JSON export/import
data/settings   DataStore
player          ExoPlayer wrapper (reused), service, PiP
```

JS module to Kotlin: `app.js` to navigation + shell, `cards.js` to components, `feed.js` +
`study.js` to `ui/home`, `watch.js` + `player.js` to `ui/watch` + `player`, `channel.js` +
`playlist.js` to `ui/channel`, `library*.js` to `data/db` + `ui/library`, `account-ui.js` to
`ui/account`, `native.js` + `api.js` to `data/extractor`.

## 6. Phases (each ends with a green APK and a parity checklist)

1. **Foundation**: theme with bundled fonts, shell (header, tabs, navigation, Back), shared
   components, Room database with all tables, JSON export/import, settings.
2. **Explore**: search and suggestions, category strip, normal feed (music, fun, trending, mixed
   so no topic floods the list, plus "because you watched"), results with endless scroll.
3. **Watch**: custom controls and gestures, quality/speed/audio/aspect, fullscreen, history and
   resume, details, channel row, actions, Up Next (3 to 4 related, then a mix).
4. **Channel and playlist** pages.
5. **Library, Account and Study mode** (exam presets, predicted date, subjects, notes).
6. **Mini player, background playback, notifications, PiP.**
7. **Polish**: icon, black splash, motion, performance; remove the web and Capacitor files.

## 7. Changes against the current app (deliberate)

- First-run "pick 5 things" screen is removed. Study setup lives in Account.
- Normal mode shows a general feed (trending, music, fun), not student topics.
- Library uses a calm off-white on obsidian look.
- No web version.

## 8. How parity is checked

After each phase you install the APK and compare with the Capacitor app side by side. Anything
that differs goes on a short list that must be empty before the next phase starts.
