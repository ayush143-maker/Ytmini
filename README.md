# AyuTube

Video discovery UI for cartoons, mathematics, coding, puzzles and facts.
Static frontend + Vercel serverless API routes + Supabase (accounts, library, history).

## Structure

- `index.html` — page shell
- `assets/css/style.css` — base styling
- `assets/js/api.js` — frontend client for `/api/search` and `/api/streams`
- `assets/js/player.js` — direct playback with YouTube embed fallback, watch-history saving
- `assets/js/categories.js` — category and suggested-search definitions
- `assets/js/supabase.js` — Supabase client (loads public config from `/api/config`)
- `assets/js/auth.js` — sign up / sign in / sign out helpers
- `assets/js/library.js` — playlists, Watch Later, watch history (all protected by RLS)
- `assets/js/app.js` — UI: search, categories, Library and Account tabs
- `api/search.js`, `api/streams.js` — server-side proxies to Piped instances
- `api/_piped.js` — shared Piped fallback helper (batched, first valid response wins)
- `api/config.js` — returns the public Supabase URL and publishable key
- `supabase/schema.sql` — reference copy of the database schema
- `vercel.json` — function timeout and security headers

## Environment variables (Vercel → Project Settings → Environment Variables)

| Name | Required | Value |
| --- | --- | --- |
| `SUPABASE_URL` | yes | `https://ydpeuorhetnehpssxhao.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | yes | the project's publishable key (`sb_publishable_...`) |
| `PIPED_INSTANCES` | no | comma-separated, verified Piped API base URLs (HTTPS only) |

Never put a secret or `service_role` key in frontend code or in `SUPABASE_PUBLISHABLE_KEY`.

## Deploy

1. Push this folder to the root of a GitHub repository (`index.html` at the root).
2. Import the repository in Vercel. Framework preset: **Other**. No build command, no output directory.
3. Add the environment variables above, then deploy.
4. In Supabase → Authentication → URL Configuration, set the Site URL and Redirect URLs to your Vercel domain.
5. Test: `/api/config`, `/api/search?q=test`, then sign up, search, play, and check Library.

## Limitations

Search and direct playback depend on third-party Piped instances, which change
availability and may block requests. When direct playback fails, the player
falls back to the YouTube embed. If every Piped instance fails, search returns
an error — set `PIPED_INSTANCES` to instances you have verified.
