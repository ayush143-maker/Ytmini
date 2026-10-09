# MiniTube

Minimal mobile-first video search UI with Vercel serverless API routes.

## Structure

- `index.html` — page structure
- `assets/css/style.css` — minimal responsive styling and Google Fonts Inter
- `assets/js/app.js` — search form and results
- `assets/js/player.js` — playback state and fallback
- `assets/js/api.js` — frontend API client
- `api/search.js` — server-side search proxy
- `api/streams.js` — server-side stream lookup proxy
- `api/_piped.js` — shared Piped-instance fallback helper
- `vercel.json` — Vercel function settings and response headers

## Deploy

1. Upload these files to the root of the GitHub repository. Keep `index.html` at the root.
2. In Vercel, confirm the project is connected to that repository and the Root Directory is `./`.
3. Deploy using the default framework preset / Other. No build command is needed.
4. Open the deployed site and test search and playback.

## Optional environment variable

Set `PIPED_INSTANCES` in Vercel Project Settings → Environment Variables to a comma-separated list of currently working Piped API base URLs, for example:

`https://your-working-piped-api.example,https://another-working-instance.example`

Use only instances you have verified. Public instances change availability and may block requests or be removed.

## Limitations

MiniTube relies on third-party Piped instances and the availability/compatibility of their returned stream URLs. This does not guarantee playback for every video. If a direct stream fails, the UI offers the YouTube watch link. Do not add API keys or secrets to frontend JavaScript.
