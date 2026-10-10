# ayutube

Video discovery for cartoons, mathematics, coding, puzzles and facts.
A static frontend, Vercel serverless API routes and Supabase for accounts.
Swiss editorial design: one grotesk (Schibsted Grotesk), a script wordmark
(Sacramento), square corners only, one pink accent.

## Structure

- `index.html` - page shell (brand, tabs, search, feed, results, watch page)
- `assets/css/style.css` - the whole design system
- `assets/icons/` - `logo.svg` (the mark), `favicon.svg`, `favicon.png`
- `assets/js/api.js` - client for `/api/search` and `/api/streams`
- `assets/js/player.js` - direct playback with a YouTube embed fallback, watch history
- `assets/js/categories.js` - categories and suggested searches
- `assets/js/supabase.js`, `auth.js`, `library.js` - Supabase client, auth, playlists / Watch later / history / channels / notes
- `assets/js/cards.js` - video card, action menu, skeletons
- `assets/js/feed.js` - home feed (lead, continue watching, category blocks, endless list)
- `assets/js/watch.js` - watch page: actions, Up next, autoplay, resume, notes, shared links
- `assets/js/search-ui.js` - local search suggestions and recent searches
- `assets/js/library-ui.js`, `account-ui.js` - Library and Account screens
- `assets/js/app.js` - shell, navigation, search, panes, history/deep links
- `api/search.js`, `api/streams.js`, `api/feed.js` - serverless routes
- `api/_piped.js`, `api/_normalize.js` - shared helpers (not routes)
- `api/config.js` - public Supabase URL and publishable key
- `supabase/schema.sql`, `supabase/migrations/` - database schema

## Environment variables (Vercel > Project Settings > Environment Variables)

| Name | Required | Value |
| --- | --- | --- |
| `SUPABASE_URL` | yes | `https://ydpeuorhetnehpssxhao.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | yes | the project's publishable key (`sb_publishable_...`) |
| `PIPED_INSTANCES` | no | comma-separated, verified Piped API base URLs (HTTPS only) |

Never put a secret or `service_role` key in the frontend or in `SUPABASE_PUBLISHABLE_KEY`.

## Deploy

1. Push the folder to a GitHub repository with `index.html` at the root.
2. Import it in Vercel. Framework preset: Other. No build command, no output directory.
3. Add the environment variables, then deploy.
4. Supabase > Authentication > URL Configuration: set the Site URL and Redirect URLs to your Vercel domain.
5. Check `/api/config`, `/api/search?q=test`, `/api/feed?q=oggy`, then sign up, play a video and open Library.

## Notes

- Search, the feed and direct playback depend on third-party Piped instances. When direct playback fails, the YouTube embed is used. If every instance fails, search and the feed show an error; set `PIPED_INSTANCES` to instances you have verified.
- The YouTube embed keeps its own controls, branding and quality menu. The embed must stay at least 200 x 200 px and nothing may cover it, so there is no floating mini-player; leaving the watch page pauses the video and shows a "Paused" strip.
- Shared links look like `/?v=VIDEO_ID` (optionally `&t=SECONDS`).
