# AyuTube Native — Product & UI Roadmap

## Product direction
AyuTube should feel like a familiar, fast video client: black canvas, off-white typography, the existing `#FB2A5F` accent, crisp media edges and restrained surfaces. Use cards for actual media, not every paragraph or setting. Navigation has four destinations: Home, Search, Library and You. Study is a setting/utility inside You, not a peer-level video destination. This is a native Kotlin + AndroidX Media3 + NewPipeExtractor app; the Capacitor branch is a read-only behavioral reference.

## This implementation pass
- Four-destination bottom navigation and Lucide-style Android vector icons.
- Cleaner Home feed with topic filters and no oversized promo banner.
- Creator avatar URLs carried from NewPipe `uploaderAvatars` into the video model and local library backup; real remote images are loaded into rounded/circular image views with initials as fallback.
- Watch page with a compact control rail, ten-second backward/forward, playback speed, and a quality selector only for compatible direct progressive streams that include audio.
- Description text collapsed to three lines with More/Less; channel descriptions are also collapsible.
- Mini-player between content and bottom navigation; leaving Watch detaches the large player surface but preserves the existing Media3 player instance.
- Reduced action clutter: Like, Save, Share and More, with secondary actions behind More.
- App content remains on-device for library/profile; no new cloud service or account dependency.

## Capability inventory and gaps

| Area | Native status | Follow-up |
|---|---|---|
| Home / search | Search for videos/channels/playlists, topic-based feed, existing NewPipe extraction | Robust continuation and load-more UX; query history and suggestions |
| Channels | Channel detail/avatar/video list | Follow/unfollow, subscriptions feed, channel tabs and channel playlists |
| Library | History, likes, Watch Later, local playlists, notes, import/export | Continue watching progress UI, playlist reorder/remove UX, robust backup schema migration |
| Player basics | Media3 play/pause/seek, ten-second seek buttons, speed choices, mini-player, compatible progressive quality selection | Stream queue/autoplay-next and retry handling |
| Player parity | Native control overlay | DASH/HLS adaptive playback and correct video+audio muxing, captions/subtitles, chapters, fullscreen/orientation, PiP and gesture shortcuts |
| Background playback | Not a complete product feature yet | Move player to a foreground MediaSessionService; notification controls and lifecycle-safe background audio |
| Downloads | Not implemented in this native branch | Permission-aware download queue, storage management and offline library; only after stream/licensing/platform feasibility checks |
| Personalization | Local study settings and local history | Bring over interests/blocked channels and history-aware feed from the existing Capacitor model |
| Community / add-ons | Not implemented | SponsorBlock, dislike/metadata integrations and optional chapter/segment handling; each must be opt-in, documented and failure-safe |
| UX hardening | Responsive native Views and loading/error messages | Accessibility pass, TalkBack labels, small-screen tests, dark-system/inset checks, automated UI/instrumented tests |

## Priority order

### P0 — Make core browsing and watch feel finished
1. Validate status bar and Android gesture/navigation-bar insets on real devices.
2. Verify thumbnail/avatar loading under slow/network-restricted conditions; preserve fallback initials and avoid stale recycled image assignment.
3. Verify mini-player pause/resume/reopen and back navigation. Never release the player while only navigating; release on replacement or Activity teardown.
4. Verify the ten-second controls, speed persistence, selected compatible quality and description expansion on phone-sized displays.
5. Build a repeatable UI test checklist and test the actual APK on-device; CI success alone does not validate stream playback.

### P1 — Feature parity from existing product architecture
1. Reuse the legacy follow/block/interests model to add subscriptions and channel preferences to native local storage.
2. Add queue management and autoplay-next, then proper paginated Home/search/channel/playlist feeds.
3. Add Continue Watching progress indicators, search history/suggestions and playlist reordering.
4. Use NewPipe’s supported stream metadata to support adaptive streams without dropping audio; never show unsupported quality choices.

### P2 — Platform playback
1. Move ExoPlayer ownership into MediaSessionService for resilient background playback and notification/media-key support.
2. Add Picture-in-Picture, fullscreen/orientation, audio focus, lifecycle recovery and track selection.
3. Build a queued/offline download manager only after reliable source and disk-management behavior is designed.

### P3 — Advanced options
Chapters, captions, segment skipping, dislike/metadata providers, richer feed ranking and optional integrations. Keep these optional and avoid making network requests every UI frame or on every tiny interaction.

## Architecture guardrails
- Maintain Kotlin branch as the sole write target. `capacitor` remains read-only source/reference; `main` is untouched.
- Keep extraction and image IO off the main thread; bound image downloads and cache size.
- Keep local preferences and saved data local unless an explicit account/sync feature is designed later.
- Distinguish implemented, testable behavior from roadmap-only items. No fake buttons or claims that background playback, full adaptive stream selection or downloads already work.
- Reuse existing model/repository/player logic where it is sound; move responsibilities into focused files when a refactor can be validated without destabilizing playback.
