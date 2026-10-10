# What changed in this update

Extract this zip over your repository (same folder structure). Nothing needs deleting.

## Added
- `api/_normalize.js`, `api/feed.js`
- `assets/icons/logo.svg`, `favicon.svg`, `favicon.png`
- `assets/js/cards.js`, `feed.js`, `watch.js`, `search-ui.js`, `library-ui.js`, `account-ui.js`
- `supabase/migrations/20261010_channel_preferences_and_video_notes.sql`
- `CHANGES.md`

## Replaced
- `index.html`, `assets/css/style.css`, `assets/js/app.js`
- `assets/js/player.js` (events, resume, seek, speed, faster fallback)
- `assets/js/library.js` (playlist progress, channel preferences, notes)
- `api/search.js` (uses `_normalize.js`; adds duration, views, age, channel id)
- `supabase/schema.sql`, `README.md`

## Database
Already applied to the AyuTube project: tables `channel_preferences` and `video_notes`, with RLS.
