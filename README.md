# AyuTube

A LibreTube-style YouTube client for Android: no ads, no accounts, no server. Your history,
playlists and follows stay on your phone. Free software under the GNU GPL v3.

## Android app (Capacitor)

AyuTube is an Android app built with [Capacitor](https://capacitorjs.com). Like LibreTube it has
**no server and no accounts**:

- **Data on the device.** Search, channels, playlists and streams come from
  [NewPipeExtractor](https://github.com/TeamNewPipe/NewPipeExtractor) running inside the app
  (`AyuExtractorPlugin`). Nothing goes through a backend.
- **Your library stays on your phone.** History, playlists, likes, follows and notes are stored in
  the app (`assets/js/library.js`). Export or import a JSON backup from the Account tab.
- **Native player.** Playback uses AndroidX Media3 / ExoPlayer (`AyuPlayerPlugin`) behind the web
  UI, with LibreTube-style controls: double-tap to seek, swipe for brightness and volume,
  long-press for 2x speed, quality / speed / audio / aspect menu and fullscreen.

Requirements: Node 22, Android Studio (JDK 21).

```bash
npm install
npm run cap:sync     # copies index.html + assets/ into www/ and syncs android/
npm run cap:open     # opens the project in Android Studio, then Run
```

GitHub Actions (`.github/workflows/android-apk.yml`) builds a debug APK on every push to this
branch; download it from the run's artifacts.

- App id: `com.ayutube.app` (`capacitor.config.json`)
- Launcher icon and splash are generated from `resources/` (`npm run cap:assets`).
  Regenerate the source PNGs with `python3 scripts/make_icons.py` (needs Pillow).
- `www/` is a build output and is git-ignored.
- YouTube changes often. If playback or search breaks, bump `NewPipeExtractor` in
  `android/app/build.gradle` and rebuild.

## License

AyuTube is free software, licensed under the **GNU General Public License v3.0**
(see [`LICENSE`](LICENSE)). You may use, study, share and modify it under those terms;
anything you distribute that is based on it must also be GPL-3.0 and ship its source.

### Credits

The Android app is modelled on [LibreTube](https://github.com/libre-tube/LibreTube)
(GPL-3.0): its player behaviour, controls and local-first data model. Video data comes from
[NewPipeExtractor](https://github.com/TeamNewPipe/NewPipeExtractor) (GPL-3.0).
Playback uses [AndroidX Media3 / ExoPlayer](https://github.com/androidx/media) (Apache-2.0).
Optional services: [SponsorBlock](https://sponsor.ajay.app/) (CC BY-NC-SA 4.0 data).
